import { createHash, randomUUID } from 'node:crypto';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { applyActionCode, connectAuthEmulator, getAuth, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

if (!process.env['FIRESTORE_EMULATOR_HOST'] || !process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
  throw new Error('Account tests require the Firestore and Auth emulators.');
}

const projectId = 'demo-staymanager-local';
const adminApp = initializeAdminApp({ projectId }, `accounts-admin-${randomUUID()}`);
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
const client = initializeApp({ apiKey: 'demo-api-key', projectId }, `accounts-client-${randomUUID()}`);
const auth = getAuth(client);
const functions = getFunctions(client, 'us-central1');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(functions, '127.0.0.1', 5001);

const password = 'Local-test-password-123!';
const workspaceId = `accounts-${randomUUID()}`;
const ownerEmail = `${randomUUID()}@example.test`;
const createdUsers = new Set<string>();
const contactPhones = new Map<string, string>();
const namePrefix = `Guest ${randomUUID().slice(0, 8)}`;
let ownerUid: string;
let phoneCounter = Math.floor(Math.random() * 9_000_000);

function input(overrides: Record<string, unknown> = {}) {
  phoneCounter += 1;
  return {
    name: `${namePrefix} Customer`,
    email: `${randomUUID()}@example.test`,
    phone: `+1555${String(phoneCounter).padStart(7, '0')}`,
    password,
    role: 'customer',
    ...overrides,
  };
}

async function register(data: Record<string, unknown>) {
  const response = await httpsCallable<Record<string, unknown>, { data: { uid: string } }>(functions, 'registerAccount')(data);
  createdUsers.add(response.data.data.uid);
  contactPhones.set(response.data.data.uid, String(data.phone));
  return response.data.data.uid;
}

async function search(query: string) {
  const result = await httpsCallable<unknown, { data: Array<{ customerId: string; name: string; email: string; phone: string }> }>(
    functions, 'searchRegisteredCustomers',
  )({ workspaceId, query });
  return result.data.data;
}

async function googleSession() {
  const email = `${randomUUID()}@example.test`;
  const credential = GoogleAuthProvider.credential(JSON.stringify({
    sub: randomUUID(), email, email_verified: true, name: 'Google Test User',
  }));
  const result = await signInWithCredential(auth, credential);
  createdUsers.add(result.user.uid);
  await result.user.getIdToken(true);
  return { uid: result.user.uid, email };
}

function googleProfile(role = 'customer') {
  const data = input();
  return { name: data.name, phone: data.phone, role, customerSearchConsent: false };
}

async function completeGoogle(data: Record<string, unknown>) {
  const response = await httpsCallable<Record<string, unknown>, { data: { uid: string } }>(functions, 'completeGoogleAccount')(data);
  const uid = response.data.data.uid;
  contactPhones.set(uid, (await db.doc(`users/${uid}`).get()).get('phoneNumber'));
  return uid;
}

beforeAll(async () => {
  const owner = await adminAuth.createUser({ email: ownerEmail, password, emailVerified: true });
  ownerUid = owner.uid;
  createdUsers.add(ownerUid);
  await db.doc(`users/${ownerUid}`).set({ uid: ownerUid, email: ownerEmail });
  await db.doc(`workspaceMembers/${ownerUid}_${workspaceId}`).set({
    userId: ownerUid, workspaceId, role: 'OWNER', isActive: true,
  });
});

afterEach(async () => { await signOut(auth); });

afterAll(async () => {
  await signOut(auth);
  await db.doc(`workspaceMembers/${ownerUid}_${workspaceId}`).delete();
  for (const uid of createdUsers) {
    const phone = contactPhones.get(uid);
    if (phone) await db.doc(`accountPhones/${createHash('sha256').update(phone).digest('hex')}`).delete();
    await db.doc(`users/${uid}`).delete();
    await db.doc(`accountRateLimits/${uid}_customers`).delete();
    await db.doc(`accountRateLimits/${uid}_members`).delete();
    await adminAuth.deleteUser(uid).catch((error) => { if (error.code !== 'auth/user-not-found') throw error; });
  }
  await deleteApp(client);
  await adminApp.delete();
});

it('stores the required phone as contact data, not an Auth phone credential', async () => {
  const data = input();
  const uid = await register(data);
  expect((await adminAuth.getUser(uid)).phoneNumber).toBeUndefined();
  expect((await db.doc(`users/${uid}`).get()).data()).toMatchObject({
    phoneNumber: data.phone,
    customerSearchConsent: false,
    email: data.email,
    nameLower: data.name.toLowerCase(),
    role: 'customer',
  });
}, 60_000);

it.each(['customer', 'owner'])('completes a new Google %s account with the authenticated email', async (role) => {
  const identity = await googleSession();
  const data = googleProfile(role);
  expect(await completeGoogle(data)).toBe(identity.uid);
  expect((await db.doc(`users/${identity.uid}`).get()).data()).toMatchObject({
    uid: identity.uid, email: identity.email, phoneNumber: data.phone, role, customerSearchConsent: false,
  });
});

it('requires Google authentication for Google profile completion', async () => {
  await expect(completeGoogle(googleProfile())).rejects.toMatchObject({ code: 'functions/unauthenticated' });
  await signInWithEmailAndPassword(auth, ownerEmail, password);
  await expect(completeGoogle(googleProfile())).rejects.toMatchObject({ code: 'functions/permission-denied' });
});

it('rejects missing Google contact phones and client-supplied identity email', async () => {
  await googleSession();
  await expect(completeGoogle({ ...googleProfile(), phone: '' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  await expect(completeGoogle({ ...googleProfile(), email: 'someone-else@example.test' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
});

it('does not let Google completion claim another account contact phone', async () => {
  const existing = input();
  await register(existing);
  const identity = await googleSession();
  await expect(completeGoogle({ ...googleProfile(), phone: existing.phone })).rejects.toMatchObject({
    code: 'functions/already-exists', details: { code: 'PHONE_IN_USE' },
  });
  expect((await db.doc(`users/${identity.uid}`).get()).exists).toBe(false);
});

it('preserves an existing Google account role, contact and consent on repeated completion', async () => {
  const identity = await googleSession();
  const data = googleProfile('owner');
  await completeGoogle({ ...data, customerSearchConsent: true });
  const before = (await db.doc(`users/${identity.uid}`).get()).data();
  await completeGoogle({ ...data, name: 'Overwrite Attempt', role: 'customer', customerSearchConsent: false });
  expect((await db.doc(`users/${identity.uid}`).get()).data()).toEqual(before);
});

it('preserves an existing owner role while completing a missing Google phone', async () => {
  const identity = await googleSession();
  await db.doc(`users/${identity.uid}`).set({ uid: identity.uid, role: 'owner', email: identity.email, customerSearchConsent: true });
  await completeGoogle(googleProfile('customer'));
  expect((await db.doc(`users/${identity.uid}`).get()).data()).toMatchObject({ role: 'owner', customerSearchConsent: true });
});

it('keeps the original password-account UID and profile when Google authenticates the same email', async () => {
  const data = input({ role: 'owner' });
  const uid = await register(data);
  const credential = GoogleAuthProvider.credential(JSON.stringify({
    sub: randomUUID(), email: data.email, email_verified: true, name: 'Google Display Name',
  }));
  const result = await signInWithCredential(auth, credential);
  expect(result.user.uid).toBe(uid);
  await result.user.getIdToken(true);
  await completeGoogle({ name: 'Do Not Overwrite', phone: data.phone, role: 'customer', customerSearchConsent: true });
  expect((await db.doc(`users/${uid}`).get()).data()).toMatchObject({
    displayName: data.name, phoneNumber: data.phone, role: 'owner', customerSearchConsent: false,
  });
});

it.each(['', '071123456', '+000123456', 'not-a-phone'])('rejects invalid or missing phone: %s', async (phone) => {
  await expect(register(input({ phone }))).rejects.toMatchObject({ code: 'functions/invalid-argument' });
});

it('rejects duplicate emails regardless of case', async () => {
  const data = input();
  await register(data);
  const retry = input();
  await expect(register({ ...retry, email: data.email.toUpperCase() })).rejects.toMatchObject({
    code: 'functions/already-exists', details: { code: 'EMAIL_IN_USE' },
  });
  await expect(register(retry)).resolves.toBeTypeOf('string');
});

it('rejects a duplicate phone under a different email', async () => {
  const data = input();
  await register(data);
  await expect(register(input({ phone: data.phone }))).rejects.toMatchObject({
    code: 'functions/already-exists', details: { code: 'PHONE_IN_USE' },
  });
});

it('preserves contact uniqueness for accounts created by earlier Auth phone flows', async () => {
  const data = input();
  const existing = await adminAuth.createUser({ email: data.email, phoneNumber: data.phone });
  createdUsers.add(existing.uid);
  await expect(register(input({ phone: data.phone }))).rejects.toMatchObject({
    code: 'functions/already-exists', details: { code: 'PHONE_IN_USE' },
  });
});

it('allows only one simultaneous registration for the same phone', async () => {
  const data = input();
  const outcomes = await Promise.allSettled([register(data), register(input({ phone: data.phone }))]);
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = outcomes.find((result) => result.status === 'rejected');
  expect(rejected).toMatchObject({ status: 'rejected', reason: { details: { code: 'PHONE_IN_USE' } } });
});

it('supports case-insensitive name prefixes and returns the phone for autofill', async () => {
  const data = input({ customerSearchConsent: true });
  const uid = await register(data);
  await signInWithEmailAndPassword(auth, ownerEmail, password);
  const matches = await search(namePrefix.toUpperCase());
  expect(matches.length).toBeLessThanOrEqual(10);
  expect(matches).toContainEqual(expect.objectContaining({
    customerId: `user:${uid}`, name: data.name, email: data.email, phone: data.phone,
  }));
  expect(await search(data.email)).toHaveLength(1);
  expect(await search(data.phone)).toHaveLength(1);
});

it('registers and signs in without email confirmation for the MVP', async () => {
  const data = input();
  await register(data);
  await signInWithEmailAndPassword(auth, data.email, password);
  expect(auth.currentUser?.emailVerified).toBe(false);
});

it('requires search consent but does not require email verification for the MVP', async () => {
  const data = input();
  const uid = await register(data);
  await signInWithEmailAndPassword(auth, ownerEmail, password);
  expect(await search(data.email)).toEqual([]);
  await db.doc(`users/${uid}`).update({ customerSearchConsent: true });
  expect(await search(data.email)).toHaveLength(1);
  await db.doc(`users/${uid}`).update({ customerSearchConsent: false });
  expect(await search(data.email)).toEqual([]);
});

it('limits repeated customer lookups', async () => {
  await signInWithEmailAndPassword(auth, ownerEmail, password);
  await db.doc(`accountRateLimits/${ownerUid}_customers`).set({ windowStart: Date.now(), count: 30 });
  await expect(search(namePrefix)).rejects.toMatchObject({ code: 'functions/resource-exhausted' });
  await db.doc(`accountRateLimits/${ownerUid}_customers`).delete();
});

it('keeps member email lookup owner-only and returns no phone', async () => {
  const data = input();
  const uid = await register(data);
  await adminAuth.updateUser(uid, { emailVerified: true });
  await signInWithEmailAndPassword(auth, ownerEmail, password);
  const response = await httpsCallable<unknown, { data: Record<string, unknown> }>(functions, 'lookupMemberByEmail')({ workspaceId, email: data.email });
  expect(response.data.data).toMatchObject({ uid, email: data.email });
  expect(response.data.data).not.toHaveProperty('phoneNumber');
  await signInWithEmailAndPassword(auth, data.email, password);
  await expect(httpsCallable(functions, 'lookupMemberByEmail')({ workspaceId, email: ownerEmail }))
    .rejects.toMatchObject({ code: 'functions/permission-denied' });
});

it('preserves future email verification support and current password recovery', async () => {
  const data = input();
  await register(data);
  await signInWithEmailAndPassword(auth, data.email, password);
  await sendEmailVerification(auth.currentUser!);
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
  const body = await response.json() as { oobCodes: Array<{ email: string; requestType: string; oobCode: string }> };
  const verification = body.oobCodes.find((entry) => entry.email === data.email && entry.requestType === 'VERIFY_EMAIL');
  expect(verification).toBeDefined();
  await applyActionCode(auth, verification!.oobCode);
  await auth.currentUser!.reload();
  expect(auth.currentUser!.emailVerified).toBe(true);
  await sendPasswordResetEmail(auth, data.email);
  const resetResponse = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
  const resetBody = await resetResponse.json() as { oobCodes: Array<{ email: string; requestType: string }> };
  expect(resetBody.oobCodes.some((entry) => entry.email === data.email && entry.requestType === 'PASSWORD_RESET')).toBe(true);
});

it('rejects unauthenticated searches', async () => {
  await expect(search(namePrefix)).rejects.toMatchObject({ code: 'functions/unauthenticated' });
});

it('allows active MVP workspace members to search without email verification', async () => {
  const data = input();
  const uid = await register(data);
  const member = db.doc(`workspaceMembers/${uid}_${workspaceId}`);
  try {
    await member.set({ userId: uid, workspaceId, role: 'STAFF', isActive: true });
    await signInWithEmailAndPassword(auth, data.email, password);
    await expect(search(namePrefix)).resolves.toBeInstanceOf(Array);
  } finally {
    await member.delete();
  }
});

it('rejects customer accounts without workspace membership', async () => {
  const data = input();
  await register(data);
  await signInWithEmailAndPassword(auth, data.email, password);
  await expect(search(namePrefix)).rejects.toMatchObject({ code: 'functions/permission-denied' });
});