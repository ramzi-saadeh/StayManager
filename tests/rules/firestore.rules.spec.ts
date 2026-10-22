import { readFileSync } from 'node:fs';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const asUser = (uid: string) => env.authenticatedContext(uid).firestore();

const newWorkspace = (ownerId: string, overrides: Record<string, unknown> = {}) => ({
  workspaceId: 'ws-new',
  ownerId,
  name: 'New workspace',
  plan: 'FREE',
  status: 'ACTIVE',
  accessApprovalStatus: 'NOT_REQUIRED',
  onboardingCompleted: true,
  accessApprovedAt: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-staymanager-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'workspaces/ws1'), {
      workspaceId: 'ws1',
      ownerId: 'owner1',
      name: 'Workspace',
      plan: 'FREE',
      status: 'ACTIVE',
      accessApprovalStatus: 'NOT_REQUIRED',
      onboardingCompleted: true,
      accessApprovedAt: null,
      createdAt: Timestamp.now(),
      workspaceSettings: { publicCalendarAccess: 'BUSY_ONLY' },
    });
    await setDoc(doc(db, 'workspaceMembers/staff1_ws1'), {
      userId: 'staff1',
      workspaceId: 'ws1',
      role: 'STAFF',
      isActive: true,
    });
    await setDoc(doc(db, 'workspaceMembers/viewer1_ws1'), {
      userId: 'viewer1',
      workspaceId: 'ws1',
      role: 'VIEWER',
      isActive: true,
    });
    await setDoc(doc(db, 'platformAdmins/admin1'), { uid: 'admin1' });
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', email: 'alice@example.com' });
    await setDoc(doc(db, 'users/bob'), { uid: 'bob', email: 'bob@example.com' });
    await setDoc(doc(db, 'workspaces/ws1/reservations/r1'), {
      reservationId: 'r1',
      createdBy: 'owner1',
      createdAt: Timestamp.now(),
      status: 'CONFIRMED',
      notes: null,
      deletedAt: null,
    });
  });
});

describe('workspace creation', () => {
  it('allows a free workspace that needs no approval', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'workspaces/ws-new'), newWorkspace('alice')));
  });

  it('allows a paid workspace that waits for payment', async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser('alice'), 'workspaces/ws-new'),
        newWorkspace('alice', {
          plan: 'PRO',
          accessApprovalStatus: 'PENDING_PAYMENT',
          onboardingCompleted: false,
        }),
      ),
    );
  });

  it('rejects a workspace that starts already approved', async () => {
    await assertFails(
      setDoc(
        doc(asUser('alice'), 'workspaces/ws-new'),
        newWorkspace('alice', { plan: 'ENTERPRISE', accessApprovalStatus: 'APPROVED' }),
      ),
    );
  });

  it('rejects a paid plan that skips the payment step', async () => {
    await assertFails(
      setDoc(doc(asUser('alice'), 'workspaces/ws-new'), newWorkspace('alice', { plan: 'PRO' })),
    );
  });

  it('rejects creating a workspace owned by someone else', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'workspaces/ws-new'), newWorkspace('bob')));
  });

  it('rejects a document id that differs from the workspaceId field', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'workspaces/other-id'), newWorkspace('alice')));
  });
});

describe('workspace updates', () => {
  it('lets the owner edit settings', async () => {
    await assertSucceeds(updateDoc(doc(asUser('owner1'), 'workspaces/ws1'), { name: 'Renamed' }));
  });

  it('blocks the owner from upgrading the plan', async () => {
    await assertFails(updateDoc(doc(asUser('owner1'), 'workspaces/ws1'), { plan: 'PRO' }));
  });

  it('lets the owner downgrade to the free plan', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'workspaces/ws1'), { plan: 'PRO' });
    });
    await assertSucceeds(updateDoc(doc(asUser('owner1'), 'workspaces/ws1'), { plan: 'FREE' }));
  });

  it('blocks the owner from approving their own workspace', async () => {
    await assertFails(
      updateDoc(doc(asUser('owner1'), 'workspaces/ws1'), { accessApprovalStatus: 'APPROVED' }),
    );
  });

  it('blocks the owner from transferring or reactivating the workspace', async () => {
    await assertFails(updateDoc(doc(asUser('owner1'), 'workspaces/ws1'), { ownerId: 'alice' }));
    await assertFails(updateDoc(doc(asUser('owner1'), 'workspaces/ws1'), { status: 'SUSPENDED' }));
  });

  it('blocks other users from editing', async () => {
    await assertFails(updateDoc(doc(asUser('alice'), 'workspaces/ws1'), { name: 'Hijacked' }));
  });

  it('lets a platform admin approve and change the plan', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser('admin1'), 'workspaces/ws1'), {
        plan: 'PRO',
        accessApprovalStatus: 'APPROVED',
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('keeps a platform admin away from other fields', async () => {
    await assertFails(updateDoc(doc(asUser('admin1'), 'workspaces/ws1'), { name: 'Renamed' }));
  });
});

describe('user profiles', () => {
  it('lets users read their own profile only', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'users/alice')));
    await assertFails(getDoc(doc(asUser('alice'), 'users/bob')));
  });

  it('allows the capped email lookup but not unbounded listing', async () => {
    const users = collection(asUser('alice'), 'users');
    await assertSucceeds(getDocs(query(users, where('email', '==', 'bob@example.com'), limit(1))));
    await assertFails(getDocs(query(users, where('email', '==', 'bob@example.com'))));
    await assertFails(getDocs(users));
  });

  it('rejects anonymous access', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice')));
  });

  it('keeps push tokens private to their owner', async () => {
    await assertSucceeds(setDoc(doc(asUser('alice'), 'users/alice/private/push'), { fcmToken: 'token' }));
    await assertFails(getDoc(doc(asUser('bob'), 'users/alice/private/push')));
    await assertFails(setDoc(doc(asUser('bob'), 'users/alice/private/push'), { fcmToken: 'x' }));
  });
});

describe('reservations', () => {
  it('lets staff update a reservation', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser('staff1'), 'workspaces/ws1/reservations/r1'), { notes: 'Late arrival' }),
    );
  });

  it('prevents rewriting who created a reservation or when', async () => {
    const ref = doc(asUser('staff1'), 'workspaces/ws1/reservations/r1');
    await assertFails(updateDoc(ref, { createdBy: 'staff1' }));
    await assertFails(updateDoc(ref, { createdAt: Timestamp.now() }));
  });

  it('requires callables for creation, lifecycle and payment changes', async () => {
    await assertFails(
      setDoc(doc(asUser('owner1'), 'workspaces/ws1/reservations/client-create'), {
        reservationId: 'client-create',
        status: 'CONFIRMED',
        createdBy: 'owner1',
        createdAt: Timestamp.now(),
      }),
    );
    const ref = doc(asUser('staff1'), 'workspaces/ws1/reservations/r1');
    await assertFails(updateDoc(ref, { status: 'CANCELLED' }));
    await assertFails(updateDoc(ref, { paymentStatus: 'PAID' }));
  });

  it('blocks viewers from writing and nobody can hard-delete', async () => {
    await assertFails(
      updateDoc(doc(asUser('viewer1'), 'workspaces/ws1/reservations/r1'), { notes: 'x' }),
    );
    await assertFails(deleteDoc(doc(asUser('owner1'), 'workspaces/ws1/reservations/r1')));
  });

  it('requires public booking requests to go through the callable', async () => {
    const request = {
      reservationId: 'r2',
      status: 'PENDING',
      createdBy: 'PUBLIC',
      updatedBy: 'PUBLIC',
      requesterUid: 'alice',
      deletedAt: null,
    };
    await assertFails(
      setDoc(doc(asUser('alice'), 'workspaces/ws1/reservations/r2'), request),
    );
    await assertFails(
      setDoc(doc(asUser('alice'), 'workspaces/ws1/reservations/r3'), { ...request, status: 'CONFIRMED' }),
    );
  });
});
