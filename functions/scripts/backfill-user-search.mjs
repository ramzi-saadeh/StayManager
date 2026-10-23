import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const projectId = process.argv.find((argument) => argument.startsWith('--project='))?.slice('--project='.length);
if (!projectId) throw new Error('An explicit --project=PROJECT_ID is required.');
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes('--production')) {
  throw new Error('Set FIRESTORE_EMULATOR_HOST or explicitly pass --production for a live project.');
}

initializeApp({ projectId });
const db = getFirestore();
let cursor;
let updated = 0;

while (true) {
  let query = db.collection('users').orderBy(FieldPath.documentId()).limit(400);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  const batch = db.batch();
  let changed = 0;
  for (const document of page.docs) {
    const profile = document.data();
    const nameLower = (profile.displayName || profile.email || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (profile.nameLower !== nameLower) {
      batch.update(document.ref, { nameLower });
      changed += 1;
    }
  }
  if (changed) await batch.commit();
  updated += changed;
  cursor = page.docs[page.docs.length - 1];
}

console.log(`Updated ${updated} searchable names in project ${projectId}.`);