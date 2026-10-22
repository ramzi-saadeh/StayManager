import { readFileSync } from 'node:fs';
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env: RulesTestEnvironment;

const png = { contentType: 'image/png' };
const bytes = (size: number) => new Uint8Array(size);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-staymanager-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'workspaces/ws1'), { workspaceId: 'ws1', ownerId: 'owner1' });
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
  });
});

const storageAs = (uid: string) => env.authenticatedContext(uid).storage();

describe('storage rules', () => {
  it('lets the owner upload a logo and staff upload resource images', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs('owner1'), 'workspaces/ws1/logos/logo.png'), bytes(1024), png),
    );
    await assertSucceeds(
      uploadBytes(ref(storageAs('staff1'), 'workspaces/ws1/resources/r1/photo.png'), bytes(1024), png),
    );
  });

  it('only lets the owner change the logo', async () => {
    await assertFails(
      uploadBytes(ref(storageAs('staff1'), 'workspaces/ws1/logos/logo.png'), bytes(1024), png),
    );
  });

  it('rejects uploads from outsiders, viewers and anonymous users', async () => {
    const path = 'workspaces/ws1/resources/r1/photo.png';
    await assertFails(uploadBytes(ref(storageAs('stranger'), path), bytes(1024), png));
    await assertFails(uploadBytes(ref(storageAs('viewer1'), path), bytes(1024), png));
    await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), path), bytes(1024), png));
  });

  it('rejects oversized files and non-image content', async () => {
    const path = 'workspaces/ws1/resources/r1/photo.png';
    await assertFails(uploadBytes(ref(storageAs('owner1'), path), bytes(6 * 1024 * 1024), png));
    await assertFails(
      uploadBytes(ref(storageAs('owner1'), path), bytes(1024), { contentType: 'text/html' }),
    );
  });

  it('allows PDF attachments on reservations but not elsewhere', async () => {
    const pdf = { contentType: 'application/pdf' };
    await assertSucceeds(
      uploadBytes(ref(storageAs('staff1'), 'workspaces/ws1/reservations/res1/invoice.pdf'), bytes(1024), pdf),
    );
    await assertFails(
      uploadBytes(ref(storageAs('owner1'), 'workspaces/ws1/resources/r1/doc.pdf'), bytes(1024), pdf),
    );
  });

  it('denies every other path', async () => {
    await assertFails(uploadBytes(ref(storageAs('owner1'), 'anything/else.png'), bytes(1024), png));
  });
});
