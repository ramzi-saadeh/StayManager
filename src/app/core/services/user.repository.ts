import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AccountRole, UserProfile } from '../models/user.model';
import { ThemeMode } from '../models/enums';

/**
 * UserRepository
 *
 * Firestore path: /users/{userId}
 *
 * READ PATH:  Firestore SDK — any authenticated user can read any profile.
 * WRITE PATH: Firestore SDK — each user may only write their own document
 *             (enforced by security rules: request.auth.uid == userId).
 *
 * The Cloud Function mirror keeps WorkspaceMember.displayName/email/photoUrl
 * in sync whenever this document changes.
 */
@Injectable({ providedIn: 'root' })
export class UserRepository {
  private firestore = inject(Firestore);

  // ── Reads ───────────────────────────────────────────────────────────────────

  /** Real-time stream of a user's profile document. */
  get(uid: string): Observable<UserProfile | undefined> {
    return docData<UserProfile>(
      doc(this.firestore, `users/${uid}`) as any,
      { idField: 'uid' },
    );
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  /**
   * Create or update the caller's profile.
   * Uses setDoc with merge so it's safe to call on every sign-in.
   */
  async upsert(
    uid: string,
    profile: Pick<UserProfile, 'displayName' | 'email' | 'photoUrl'> & {
      role?: AccountRole;
      theme?: ThemeMode;
    },
  ): Promise<void> {
    const ref = doc(this.firestore, `users/${uid}`);
    await setDoc(
      ref,
      {
        uid,
        ...profile,
        nameLower: profile.displayName.trim().toLowerCase().replace(/\s+/g, ' '),
        role: profile.role ?? 'customer',
        theme: profile.theme ?? ThemeMode.LIGHT,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  /** Update only mutable profile fields (displayName, photoUrl). */
  async update(
    uid: string,
    updates: Partial<Pick<UserProfile, 'displayName' | 'photoUrl' | 'theme' | 'customerSearchConsent'>>,
  ): Promise<void> {
    const ref = doc(this.firestore, `users/${uid}`);
    await setDoc(
      ref,
      {
        uid,
        ...updates,
        ...(updates.displayName !== undefined ? {
          nameLower: updates.displayName.trim().toLowerCase().replace(/\s+/g, ' '),
        } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
