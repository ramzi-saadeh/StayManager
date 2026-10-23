import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './base.model';
import { ThemeMode } from './enums';

/**
 * Firestore path: /users/{userId}
 *
 * Pure identity profile document. Contains no workspace references.
 * Workspace membership is stored exclusively in /workspaceMembers/{userId}_{workspaceId}.
 *
 * Document ID: Firebase Auth UID.
 */
export type AccountRole = 'customer' | 'owner';

export interface UserProfile extends FirestoreDocument {
  uid: string;
  displayName: string;
  nameLower?: string;
  phoneNumber?: string | null;
  customerSearchConsent?: boolean;
  email: string;
  photoUrl: string | null;
  role?: AccountRole;
  theme?: ThemeMode;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
