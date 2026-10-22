import { Timestamp } from 'firebase/firestore';
import { WorkspaceRole } from './enums';

/**
 * Firestore path: /workspaceMembers/{userId}_{workspaceId}
 *
 * Authoritative membership and permission record. Top-level collection
 * (not a subcollection) to support multi-workspace per user:
 *   - "All workspaces for user X" → WHERE userId == X
 *   - "All members of workspace Y" → WHERE workspaceId == Y
 *
 * Document ID: Composite key "{userId}_{workspaceId}".
 * Deterministic IDs enable atomic upserts without a prior query.
 *
 * Required Firestore indexes:
 *   - userId ASC (workspace switcher)
 *   - workspaceId ASC, role ASC (members management page)
 *   - workspaceId ASC, isActive ASC (active member queries)
 */
export interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;

  /** Denormalized from /users/{userId} for display. Kept in sync by Cloud Function. */
  displayName: string;

  /** Denormalized from /users/{userId}. */
  email: string;

  /** Denormalized from /users/{userId}. */
  photoUrl: string | null;

  /** UID of the user who sent the invitation. Null for the founding Owner. */
  invitedBy: string | null;

  joinedAt: Timestamp;
  updatedAt: Timestamp;

  /**
   * false = access revoked. Record is preserved for audit trail and to
   * maintain displayName resolution on historical reservations.
   * Cloud Function clears the workspace entry from custom JWT claims on write.
   */
  isActive: boolean;
}
