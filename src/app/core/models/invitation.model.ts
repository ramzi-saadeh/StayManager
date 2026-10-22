import { Timestamp } from 'firebase/firestore';
import { InvitationStatus, WorkspaceRole } from './enums';

/**
 * Roles that can be assigned via invitation.
 * OWNER is excluded: owners are only created at workspace setup, never invited.
 */
export type InvitableRole = WorkspaceRole.STAFF | WorkspaceRole.VIEWER;

/**
 * Firestore path: /workspaces/{workspaceId}/invitations/{invitationId}
 *
 * Tracks pending invitations before a user accepts. Acceptance writes a new
 * WorkspaceMember document via Cloud Function.
 *
 * Document ID: Auto-generated Firestore ID.
 *
 * SECURITY: The `token` field is write-once and must only be readable by the
 * Cloud Function that validates it. Client security rules must deny all reads
 * on this collection. The token is delivered to the invitee via email only.
 */
export interface Invitation {
  invitationId: string;
  email: string;

  /** Only STAFF or VIEWER can be invited. */
  role: InvitableRole;

  /**
   * Cryptographically random token. Delivered via email link. Never exposed
   * in Firestore client queries. Validated by acceptInvitation Cloud Function.
   */
  token: string;

  /** UID of the workspace member who sent the invitation. */
  invitedBy: string;

  invitedAt: Timestamp;

  /** Default: 48 hours from invitedAt. */
  expiresAt: Timestamp;

  status: InvitationStatus;
}
