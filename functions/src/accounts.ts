import { getAuth } from 'firebase-admin/auth';
import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import { REQUIRE_EMAIL_VERIFICATION } from './auth-policy.js';

const registrationSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  role: z.enum(['customer', 'owner']),
  customerSearchConsent: z.boolean().default(false),
}).strict();

const searchSchema = z.object({
  workspaceId: z.string().min(1).max(128).regex(/^[^/]+$/),
  query: z.string().trim().min(2).max(120),
}).strict();

async function limitLookup(uid: string, action: string): Promise<void> {
  const ref = getFirestore().doc(`accountRateLimits/${uid}_${action}`);
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.data();
    const now = Date.now();
    const fresh = !previous || now - previous.windowStart >= 60_000;
    if (!fresh && previous.count >= 30) throw new HttpsError('resource-exhausted', 'Please try again in a minute.');
    transaction.set(ref, { windowStart: fresh ? now : previous.windowStart, count: fresh ? 1 : previous.count + 1 });
  });
}

async function requireWorkspaceAccess(request: CallableRequest, workspaceId: string, ownerOnly = false): Promise<string> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const member = await getFirestore().doc(`workspaceMembers/${request.auth.uid}_${workspaceId}`).get();
  const membership = member.data();
  if (!membership?.isActive || !(ownerOnly ? ['OWNER'] : ['OWNER', 'STAFF']).includes(membership.role)) {
    throw new HttpsError('permission-denied', 'Workspace access required.');
  }
  if (REQUIRE_EMAIL_VERIFICATION && !request.auth.token.email_verified) throw new HttpsError('failed-precondition', 'Verify your email before looking up accounts.');
  await limitLookup(request.auth.uid, ownerOnly ? 'members' : 'customers');
  return request.auth.uid;
}

export const registerAccount = onCall({ region: 'us-central1', maxInstances: 10 }, async (request) => {
  const parsed = registrationSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Valid name, email, password and international phone are required.');
  const input = parsed.data;
  const auth = getAuth();
  const db = getFirestore();
  const legacy = await auth.getUserByPhoneNumber(input.phone).catch((error) => {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  });
  if (legacy) throw new HttpsError('already-exists', 'An account with this phone already exists.', { code: 'PHONE_IN_USE' });
  const uid = randomUUID();
  const phoneClaim = db.doc(`accountPhones/${createHash('sha256').update(input.phone).digest('hex')}`);
  let claimed = false;
  let created = false;
  try {
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(phoneClaim)).exists) {
        throw new HttpsError('already-exists', 'An account with this phone already exists.', { code: 'PHONE_IN_USE' });
      }
      transaction.create(phoneClaim, { uid, createdAt: FieldValue.serverTimestamp() });
    });
    claimed = true;
    await auth.createUser({
      uid,
      email: input.email,
      password: input.password,
      displayName: input.name,
    });
    created = true;
    await getFirestore().doc(`users/${uid}`).create({
      uid,
      displayName: input.name,
      nameLower: input.name.toLowerCase().replace(/\s+/g, ' '),
      email: input.email,
      phoneNumber: input.phone,
      customerSearchConsent: input.customerSearchConsent,
      photoUrl: null,
      role: input.role,
      theme: 'light',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, data: { uid }, timestamp: new Date().toISOString() };
  } catch (error) {
    let canRelease = true;
    if (created) {
      try {
        await auth.deleteUser(uid);
      } catch {
        canRelease = false;
        logger.error('Could not remove an incomplete registration.', { uid });
      }
    }
    if (claimed && canRelease) await phoneClaim.delete();
    if (error instanceof HttpsError) throw error;
    const code = (error as { code?: string | number }).code;
    if (code === 'auth/email-already-exists' || code === 'auth/phone-number-already-exists') {
      throw new HttpsError('already-exists', 'An account with these contact details already exists.', {
        code: code === 'auth/email-already-exists' ? 'EMAIL_IN_USE' : 'PHONE_IN_USE',
      });
    }
    logger.error('Registration failed.', { code });
    throw new HttpsError('internal', 'Registration could not be completed.');
  }
});

export const searchRegisteredCustomers = onCall({ region: 'us-central1', maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to search customers.');
  const parsed = searchSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Enter at least two characters.');
  const db = getFirestore();
  await requireWorkspaceAccess(request, parsed.data.workspaceId);

  const query = parsed.data.query.toLowerCase().replace(/\s+/g, ' ');
  const users = db.collection('users').where('customerSearchConsent', '==', true);
  const snapshot = query.includes('@')
    ? await users.where('email', '==', query).limit(1).get()
    : /^\+[1-9]\d{7,14}$/.test(query)
      ? await users.where('phoneNumber', '==', query).limit(1).get()
      : await users.orderBy('nameLower').startAt(query).endAt(`${query}\uf8ff`).limit(10).get();
  const candidates = await Promise.all(snapshot.docs.map(async (document) => {
    const profile = document.data();
    const identity = await getAuth().getUser(document.id).catch(() => null);
    if (!identity || identity.disabled || (REQUIRE_EMAIL_VERIFICATION && !identity.emailVerified)) return null;
    return {
      customerId: `user:${document.id}`,
      name: profile.displayName || profile.email,
      email: profile.email ?? null,
      phone: profile.phoneNumber ?? '',
      notes: null,
      nameLower: profile.nameLower ?? (profile.displayName ?? '').toLowerCase(),
      phoneNormalized: profile.phoneNumber ?? '',
    };
  }));
  const customers = candidates.filter((customer) => customer !== null);
  return { success: true, data: customers, timestamp: new Date().toISOString() };
});

export const completeGoogleAccount = onCall({ region: 'us-central1', maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in with Google first.');
  if (request.auth.token.firebase?.sign_in_provider !== 'google.com') {
    throw new HttpsError('permission-denied', 'Google sign-in is required.');
  }
  const parsed = registrationSchema.pick({ name: true, phone: true, role: true, customerSearchConsent: true }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Valid name, international phone and account role are required.');
  const input = parsed.data;
  const identity = await getAuth().getUser(request.auth.uid);
  if (!identity.email || identity.disabled) throw new HttpsError('failed-precondition', 'An active Google email identity is required.');
  const legacy = await getAuth().getUserByPhoneNumber(input.phone).catch((error) => {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  });
  if (legacy && legacy.uid !== identity.uid) {
    throw new HttpsError('already-exists', 'An account with this phone already exists.', { code: 'PHONE_IN_USE' });
  }
  const db = getFirestore();
  const profileRef = db.doc(`users/${identity.uid}`);
  const phoneRef = db.doc(`accountPhones/${createHash('sha256').update(input.phone).digest('hex')}`);
  await db.runTransaction(async (transaction) => {
    const profile = await transaction.get(profileRef);
    const existing = profile.data();
    if (existing?.phoneNumber && ['customer', 'owner'].includes(existing.role)) return;
    const phone = await transaction.get(phoneRef);
    if (phone.exists && phone.get('uid') !== identity.uid) {
      throw new HttpsError('already-exists', 'An account with this phone already exists.', { code: 'PHONE_IN_USE' });
    }
    if (!phone.exists) transaction.create(phoneRef, { uid: identity.uid, createdAt: FieldValue.serverTimestamp() });
    transaction.set(profileRef, {
      uid: identity.uid,
      email: identity.email!.toLowerCase(),
      displayName: input.name,
      nameLower: input.name.toLowerCase().replace(/\s+/g, ' '),
      phoneNumber: input.phone,
      role: existing?.role === 'owner' ? 'owner' : existing?.role === 'customer' ? 'customer' : input.role,
      customerSearchConsent: existing?.customerSearchConsent ?? input.customerSearchConsent,
      photoUrl: existing?.photoUrl ?? identity.photoURL ?? null,
      theme: existing?.theme ?? 'light',
      createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { success: true, data: { uid: identity.uid }, timestamp: new Date().toISOString() };
});

export const lookupMemberByEmail = onCall({ region: 'us-central1', maxInstances: 10 }, async (request) => {
  const parsed = z.object({ workspaceId: searchSchema.shape.workspaceId, email: z.string().trim().email().max(254) }).strict().safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A workspace and email are required.');
  await requireWorkspaceAccess(request, parsed.data.workspaceId, true);
  const user = await getAuth().getUserByEmail(parsed.data.email.toLowerCase()).catch((error) => {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  });
  return {
    success: true,
    data: user && !user.disabled && (!REQUIRE_EMAIL_VERIFICATION || user.emailVerified) ? { uid: user.uid, displayName: user.displayName ?? '', email: user.email ?? '' } : null,
    timestamp: new Date().toISOString(),
  };
});
