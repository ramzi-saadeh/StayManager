import { randomUUID } from 'node:crypto';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { deleteApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { FirebaseError } from 'firebase/app';

const projectId = 'demo-staymanager-local';
const adminApp = initializeAdminApp({ projectId }, `admin-test-${randomUUID()}`);
const db = getAdminFirestore(adminApp);
const clientApp = initializeApp({
  apiKey: 'demo-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  appId: '1:000000000000:web:test',
}, `client-test-${randomUUID()}`);
const auth = getAuth(clientApp);
const functions = getFunctions(clientApp, 'us-central1');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(functions, '127.0.0.1', 5001);

let workspaceId: string;
let ownerUid: string;
let ownerEmail: string;
const testPassword = 'Local-test-password-123!';

async function createIdentity(email = `${randomUUID()}@example.test`): Promise<string> {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    testPassword,
  );
  await getAdminAuth(adminApp).updateUser(credential.user.uid, { emailVerified: true });
  await credential.user.getIdToken(true);
  return credential.user.uid;
}

async function seedWorkspace(): Promise<void> {
  workspaceId = `ws-${randomUUID()}`;
  ownerEmail = `${randomUUID()}@example.test`;
  ownerUid = await createIdentity(ownerEmail);
  await db.doc(`workspaces/${workspaceId}`).set({
    workspaceId,
    ownerId: ownerUid,
    name: 'Local test workspace',
    status: 'ACTIVE',
    plan: 'FREE',
    currency: 'USD',
    timezone: 'America/New_York',
    accessApprovalStatus: 'NOT_REQUIRED',
    workspaceSettings: {
      publicCalendarAccess: 'BUSY_ONLY',
      operatingRules: { workingDays: [0, 1, 2, 3, 4, 5, 6], blockedDays: [], blockedHours: [] },
    },
  });
  await db.doc(`workspaces/${workspaceId}/resources/room1`).set({
    resourceId: 'room1',
    name: 'Meeting room',
    type: 'MEETING_ROOM',
    bookingMode: 'DATE_RANGE',
    basePrice: 100,
    priceUnit: 'PER_NIGHT',
    isActive: true,
    bufferMinutes: 0,
  });
  await db.doc(`workspaceMembers/${ownerUid}_${workspaceId}`).set({
    userId: ownerUid,
    workspaceId,
    role: 'OWNER',
    isActive: true,
  });
}

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    resourceId: 'room1',
    bookingMode: 'DATE_RANGE',
    startDate: '2026-11-02',
    endDate: '2026-11-04',
    customer: { name: 'Test Guest', phone: '+15555550123', email: 'guest@example.test' },
    price: { amount: 250, currency: 'USD', unit: 'PER_NIGHT', quantity: 2, basePrice: 100 },
    ...overrides,
  };
}

async function callCreate(data: Record<string, unknown>) {
  const result = await httpsCallable<
    Record<string, unknown>,
    { success: true; data: { reservationId: string; seriesId?: string; createdCount: number; skippedCount: number }; timestamp: string }
  >(functions, 'createReservation')(data);
  return result.data;
}

async function callStatus(data: Record<string, unknown>) {
  const result = await httpsCallable<
    Record<string, unknown>,
    { success: true; data: { updatedCount: number }; timestamp: string }
  >(functions, 'updateReservationStatus')(data);
  return result.data;
}

async function callPayment(data: Record<string, unknown>) {
  const result = await httpsCallable<
    Record<string, unknown>,
    { success: true; data: null; timestamp: string }
  >(functions, 'updateReservationPayment')(data);
  return result.data;
}

async function expectCallableError(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(FirebaseError);
  expect((caught as FirebaseError).code).toBe(`functions/${code}`);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the emulator trigger.');
}

beforeEach(async () => {
  await signOut(auth);
  await seedWorkspace();
});

it('allows booking mutations without email verification for the MVP', async () => {
  await getAdminAuth(adminApp).updateUser(ownerUid, { emailVerified: false });
  await auth.currentUser!.getIdToken(true);
  const created = await callCreate(createPayload());
  const reservationId = created.data.reservationId;
  await expect(callPayment({ workspaceId, reservationId, paymentStatus: 'PAID', paymentMethod: 'Cash' })).resolves.toMatchObject({ success: true });
  await expect(callStatus({ workspaceId, reservationId, status: 'COMPLETED' })).resolves.toMatchObject({ success: true });
}, 60_000);

afterAll(async () => {
  await signOut(auth);
  if (workspaceId && ownerUid) {
    await db.recursiveDelete(db.doc(`workspaces/${workspaceId}`));
    await db.recursiveDelete(db.doc(`workspaceMembers/${ownerUid}_${workspaceId}`));
  }
  await adminApp.delete();
  await deleteApp(clientApp);
});

describe('reservation callables (Firebase emulators)', () => {
  it('creates a manager reservation with server-derived resource and price metadata', async () => {
    const result = await callCreate(createPayload());
    const reservation = await db.doc(`workspaces/${workspaceId}/reservations/${result.data.reservationId}`).get();

    expect(reservation.get('status')).toBe('CONFIRMED');
    expect(reservation.get('resourceName')).toBe('Meeting room');
    expect(reservation.get('resourceType')).toBe('MEETING_ROOM');
    expect(reservation.get('price.currency')).toBe('USD');
    expect(reservation.get('createdBy')).toBe(ownerUid);
    expect((await db.doc(`workspaces/${workspaceId}/publicBusySlots/${result.data.reservationId}`).get()).exists).toBe(true);
    expect((await reservation.ref.collection('auditLog').get()).size).toBe(1);
  });

  it('rejects overlapping requests and serializes simultaneous creates', async () => {
    const attempts = await Promise.allSettled([
      callCreate(createPayload({ idempotencyKey: randomUUID() })),
      callCreate(createPayload({ idempotencyKey: randomUUID() })),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('prevents a public customer request from overlapping an owner reservation', async () => {
    await callCreate(createPayload());
    await createIdentity();
    const payload = createPayload({ isPublicRequest: true });
    delete payload.price;

    await expectCallableError(callCreate(payload), 'already-exists');
    expect((await db.collection(`workspaces/${workspaceId}/reservations`).get()).size).toBe(1);
  });

  it('treats pending public requests as blocking reservations', async () => {
    const firstCustomerUid = await createIdentity();
    const firstPayload = createPayload({ isPublicRequest: true });
    delete firstPayload.price;
    const pending = await callCreate(firstPayload);

    const secondCustomerUid = await createIdentity();
    expect(secondCustomerUid).not.toBe(firstCustomerUid);
    const secondPayload = createPayload({ isPublicRequest: true });
    delete secondPayload.price;
    await expectCallableError(callCreate(secondPayload), 'already-exists');
    expect((await db.doc(`workspaces/${workspaceId}/reservations/${pending.data.reservationId}`).get()).get('status')).toBe('PENDING');
  });

  it('allows a date-range reservation to start at the previous checkout boundary', async () => {
    await callCreate(createPayload());
    const adjacent = await callCreate(createPayload({
      startDate: '2026-11-04',
      endDate: '2026-11-05',
    }));

    const reservation = await db.doc(`workspaces/${workspaceId}/reservations/${adjacent.data.reservationId}`).get();
    expect(reservation.get('startDate')).toBe('2026-11-04');
    expect((await db.collection(`workspaces/${workspaceId}/reservations`).get()).size).toBe(2);
  });

  it('enforces datetime turnaround buffers without rejecting the exact buffer boundary', async () => {
    await db.doc(`workspaces/${workspaceId}/resources/room1`).update({
      bookingMode: 'DATETIME_RANGE',
      bufferMinutes: 30,
    });

    const firstPayload = createPayload({
      bookingMode: 'DATETIME_RANGE',
      start: '2026-11-02T09:00:00-05:00',
      end: '2026-11-02T10:00:00-05:00',
      price: { amount: 100, currency: 'USD', unit: 'PER_HOUR', quantity: 1, basePrice: 100 },
    });
    delete firstPayload.startDate;
    delete firstPayload.endDate;
    await callCreate(firstPayload);

    const tooSoon = createPayload({
      bookingMode: 'DATETIME_RANGE',
      start: '2026-11-02T10:29:00-05:00',
      end: '2026-11-02T11:00:00-05:00',
      price: { amount: 50, currency: 'USD', unit: 'PER_HOUR', quantity: 1, basePrice: 100 },
    });
    delete tooSoon.startDate;
    delete tooSoon.endDate;
    await expectCallableError(callCreate(tooSoon), 'already-exists');

    const atBoundary = createPayload({
      bookingMode: 'DATETIME_RANGE',
      start: '2026-11-02T10:30:00-05:00',
      end: '2026-11-02T11:00:00-05:00',
      price: { amount: 50, currency: 'USD', unit: 'PER_HOUR', quantity: 1, basePrice: 100 },
    });
    delete atBoundary.startDate;
    delete atBoundary.endDate;
    await expect(callCreate(atBoundary)).resolves.toBeDefined();
  });

  it('deduplicates retries with the same idempotency key', async () => {
    const idempotencyKey = randomUUID();
    const first = await callCreate(createPayload({ idempotencyKey }));
    const second = await callCreate(createPayload({ idempotencyKey }));

    expect(second.data.reservationId).toBe(first.data.reservationId);
    expect((await db.collection(`workspaces/${workspaceId}/reservations`).get()).size).toBe(1);
  });

  it('creates a weekly series atomically with per-booking price and first-only payment', async () => {
    const result = await callCreate(createPayload({
      idempotencyKey: randomUUID(),
      recurrence: {
        frequency: 'WEEKLY',
        interval: 1,
        end: { type: 'COUNT', count: 3 },
      },
      paymentStatus: 'PAID',
      paymentMethod: 'Cash',
    }));
    const reservations = await db.collection(`workspaces/${workspaceId}/reservations`)
      .where('seriesId', '==', result.data.seriesId)
      .orderBy('occurrenceIndex')
      .get();

    expect(result.data.createdCount).toBe(3);
    expect(result.data.skippedCount).toBe(0);
    expect(reservations.docs.map((doc) => doc.get('startDate'))).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
    expect(reservations.docs.map((doc) => doc.get('price.amount'))).toEqual([250, 250, 250]);
    expect(reservations.docs.map((doc) => doc.get('paymentStatus'))).toEqual(['PAID', 'UNPAID', 'UNPAID']);
    expect(reservations.docs.map((doc) => doc.get('occurrenceIndex'))).toEqual([1, 2, 3]);
  });

  it('skips conflicting occurrences only when explicitly requested', async () => {
    await db.doc(`workspaces/${workspaceId}/reservations/already-booked`).set({
      reservationId: 'already-booked',
      resourceId: 'room1',
      bookingMode: 'DATE_RANGE',
      startDate: '2026-11-09',
      endDate: '2026-11-11',
      status: 'CONFIRMED',
      deletedAt: null,
    });
    const result = await callCreate(createPayload({
      recurrence: {
        frequency: 'WEEKLY',
        interval: 1,
        end: { type: 'COUNT', count: 3 },
      },
      skipConflictingOccurrences: true,
    }));
    const reservations = await db.collection(`workspaces/${workspaceId}/reservations`)
      .where('seriesId', '==', result.data.seriesId)
      .get();

    expect(result.data.createdCount).toBe(2);
    expect(result.data.skippedCount).toBe(1);
    expect(reservations.docs.map((doc) => doc.get('occurrenceIndex')).sort()).toEqual([1, 3]);
  });

  it('cancels this or all upcoming series occurrences atomically', async () => {
    const created = await callCreate(createPayload({
      recurrence: { frequency: 'WEEKLY', interval: 1, end: { type: 'COUNT', count: 3 } },
    }));
    const result = await callStatus({
      workspaceId,
      reservationId: created.data.reservationId,
      status: 'CANCELLED',
      scope: 'SERIES',
    });
    const reservations = await db.collection(`workspaces/${workspaceId}/reservations`)
      .where('seriesId', '==', created.data.seriesId)
      .get();

    expect(result.data.updatedCount).toBe(3);
    expect(reservations.docs.every((doc) => doc.get('status') === 'CANCELLED')).toBe(true);
    expect(reservations.docs.every((doc) => doc.get('cancellationReason') === null)).toBe(true);
  });

  it('preserves the weekly local time through daylight-saving transitions', async () => {
    await db.doc(`workspaces/${workspaceId}/resources/room1`).update({ bookingMode: 'DATETIME_RANGE' });
    const payload = createPayload({
      bookingMode: 'DATETIME_RANGE',
      start: '2026-10-25T09:00:00-04:00',
      end: '2026-10-25T10:00:00-04:00',
      price: { amount: 100, currency: 'USD', unit: 'PER_HOUR', quantity: 1, basePrice: 100 },
      recurrence: { frequency: 'WEEKLY', interval: 1, end: { type: 'COUNT', count: 4 } },
    });
    delete payload.startDate;
    delete payload.endDate;
    const result = await callCreate(payload);
    const reservations = await db.collection(`workspaces/${workspaceId}/reservations`)
      .where('seriesId', '==', result.data.seriesId)
      .orderBy('occurrenceIndex')
      .get();

    expect(reservations.docs.map((doc) => doc.get('start').toDate().toISOString())).toEqual([
      '2026-10-25T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
      '2026-11-08T14:00:00.000Z',
      '2026-11-15T14:00:00.000Z',
    ]);
  });

  it('rejects invalid or mismatched booking data', async () => {
    await expectCallableError(callCreate(createPayload({ endDate: '2026-11-02' })), 'invalid-argument');
    await expectCallableError(callCreate(createPayload({ bookingMode: 'DATETIME_RANGE' })), 'invalid-argument');
    await expectCallableError(callCreate(createPayload({ price: { amount: -1 } })), 'invalid-argument');
  });

  it('rejects users without workspace permissions', async () => {
    await createIdentity();
    await expectCallableError(callCreate(createPayload()), 'permission-denied');
  });

  it('creates public requests as pending and queues an owner notification', async () => {
    const guestUid = await createIdentity();
    const payload = createPayload({ isPublicRequest: true });
    delete payload.price;
    const result = await callCreate(payload);
    const reservation = await db.doc(`workspaces/${workspaceId}/reservations/${result.data.reservationId}`).get();
    const outbox = await db.collection(`workspaces/${workspaceId}/notificationOutbox`)
      .where('reservationId', '==', result.data.reservationId)
      .get();
    const notificationRef = outbox.docs[0].ref;
    await waitFor(async () => (await notificationRef.get()).get('deliveryStatus') === 'EMULATOR_SKIPPED');

    expect(guestUid).not.toBe(ownerUid);
    expect(reservation.get('status')).toBe('PENDING');
    expect(reservation.get('requesterUid')).toBe(guestUid);
    expect(reservation.get('price.amount')).toBe(200);
    expect(outbox.size).toBe(1);
    expect(outbox.docs[0].get('recipientUids')).toContain(ownerUid);
  });

  it('confirms a request, writes the busy projection and queues a guest notification', async () => {
    const guestUid = await createIdentity();
    const payload = createPayload({ isPublicRequest: true });
    delete payload.price;
    const requested = await callCreate(payload);
    await signOut(auth);
    await signInWithEmailAndPassword(auth, ownerEmail, testPassword);
    const updated = await callStatus({
      workspaceId,
      reservationId: requested.data.reservationId,
      status: 'CONFIRMED',
      reason: undefined,
    });
    const reservation = await db.doc(`workspaces/${workspaceId}/reservations/${requested.data.reservationId}`).get();
    const outbox = await db.collection(`workspaces/${workspaceId}/notificationOutbox`)
      .where('reservationId', '==', requested.data.reservationId)
      .get();

    expect(updated.success).toBe(true);
    expect(reservation.get('status')).toBe('CONFIRMED');
    expect(outbox.docs.map((doc) => doc.get('type'))).toContain('RESERVATION_CONFIRMED');
    expect(outbox.docs.some((doc) => doc.get('recipientUids').includes(guestUid))).toBe(true);
    expect((await db.doc(`workspaces/${workspaceId}/publicBusySlots/${requested.data.reservationId}`).get()).exists).toBe(true);
    expect((await reservation.ref.collection('auditLog').get()).size).toBe(2);
  });

  it('declines a pending request as cancelled and queues a guest notification', async () => {
    const guestUid = await createIdentity();
    const payload = createPayload({ isPublicRequest: true });
    delete payload.price;
    const requested = await callCreate(payload);
    await signOut(auth);
    await signInWithEmailAndPassword(auth, ownerEmail, testPassword);
    await callStatus({
      workspaceId,
      reservationId: requested.data.reservationId,
      status: 'CANCELLED',
      reason: 'Unavailable',
    });

    const reservation = await db.doc(`workspaces/${workspaceId}/reservations/${requested.data.reservationId}`).get();
    const outbox = await db.collection(`workspaces/${workspaceId}/notificationOutbox`)
      .where('reservationId', '==', requested.data.reservationId)
      .where('type', '==', 'RESERVATION_DECLINED')
      .get();
    expect(reservation.get('status')).toBe('CANCELLED');
    expect(reservation.get('cancellationReason')).toBe('Unavailable');
    expect(outbox.docs[0].get('recipientUids')).toContain(guestUid);
    expect((await db.doc(`workspaces/${workspaceId}/publicBusySlots/${requested.data.reservationId}`).get()).exists).toBe(false);
  });

  it('rejects invalid status transitions and viewers', async () => {
    const created = await callCreate(createPayload());
    await expectCallableError(
      callStatus({ workspaceId, reservationId: created.data.reservationId, status: 'DELETED' }),
      'failed-precondition',
    );

    const viewerUid = await createIdentity();
    await db.doc(`workspaceMembers/${viewerUid}_${workspaceId}`).set({
      userId: viewerUid,
      workspaceId,
      role: 'VIEWER',
      isActive: true,
    });
    await expectCallableError(
      callStatus({ workspaceId, reservationId: created.data.reservationId, status: 'CANCELLED' }),
      'permission-denied',
    );
  });

  it('updates payment status through the backend and writes an audit entry', async () => {
    const created = await callCreate(createPayload());
    const result = await callPayment({
      workspaceId,
      reservationId: created.data.reservationId,
      paymentStatus: 'PAID',
      paymentMethod: 'Cash',
    });
    const reservation = await db.doc(`workspaces/${workspaceId}/reservations/${created.data.reservationId}`).get();
    const audit = await reservation.ref.collection('auditLog').where('action', '==', 'PAYMENT_UPDATED').get();

    expect(result.success).toBe(true);
    expect(reservation.get('paymentStatus')).toBe('PAID');
    expect(reservation.get('paymentMethod')).toBe('Cash');
    expect(audit.size).toBe(1);
  });
});
