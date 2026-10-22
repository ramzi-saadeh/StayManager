import { Timestamp } from 'firebase/firestore';
import { WorkspaceRole } from './enums';

// =============================================================================
// FIRESTORE DOCUMENT BASE
// =============================================================================

/**
 * All Firestore document interfaces extend this to enforce consistent
 * audit timestamps across the schema.
 */
export interface FirestoreDocument {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Extended by documents that support soft-delete semantics.
 * A document is considered deleted when deletedAt is non-null.
 */
export interface SoftDeletable {
  deletedAt: Timestamp | null;
  deletedBy: string | null;
}

// =============================================================================
// FIREBASE AUTH CUSTOM CLAIMS
// =============================================================================

/**
 * Shape of the custom claims written to Firebase Auth tokens by the
 * onMemberWrite Cloud Function trigger.
 *
 * JWT size limit: 1,000 bytes. For MVP (one workspace per user) this is safe.
 * Phase 2 multi-workspace migration: if a user accumulates many workspaces,
 * the claim must store only workspace IDs and roles must be resolved via a
 * Firestore get() in security rules — accepting the billing cost at that scale.
 *
 * Usage in Firestore Security Rules:
 *   request.auth.token.workspaces[workspaceId] == 'OWNER'
 */
export interface FirebaseCustomClaims {
  workspaces: Record<string, WorkspaceRole>;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Represents a Firestore document snapshot stripped of server-managed fields.
 * Used as the base type for write payloads in services that write directly
 * to Firestore (non-Cloud-Function paths).
 */
export type OmitFirestoreFields<T> = Omit<T, 'createdAt' | 'updatedAt'>;

/**
 * Makes all nested properties optional. Used when constructing partial
 * update payloads for Firestore.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
