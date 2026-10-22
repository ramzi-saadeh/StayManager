import { InvitableRole } from '../models/invitation.model';

// =============================================================================
// INVITE MEMBER
// Cloud Function: inviteMember (HTTPS Callable)
// Creates an Invitation document and sends the invitation email.
// =============================================================================

export interface InviteMemberDto {
  workspaceId: string;
  email: string;
  role: InvitableRole;
}

export interface InviteMemberResponseData {
  invitationId: string;
}

// =============================================================================
// ACCEPT INVITATION
// Cloud Function: acceptInvitation (HTTPS Callable)
// Validates token, checks expiry, creates WorkspaceMember document,
// updates Invitation status to ACCEPTED, triggers JWT claim refresh.
// =============================================================================

export interface AcceptInvitationDto {
  /** The raw token from the invitation email link query param. */
  token: string;
}

export interface AcceptInvitationResponseData {
  workspaceId: string;
  workspaceName: string;
}

// =============================================================================
// UPDATE MEMBER ROLE
// Cloud Function: updateMemberRole (HTTPS Callable)
// Owner only. Updates role on WorkspaceMember document and refreshes JWT claims.
// =============================================================================

export interface UpdateMemberRoleDto {
  workspaceId: string;
  userId: string;
  role: InvitableRole;
}

// =============================================================================
// REVOKE MEMBER ACCESS
// Cloud Function: revokeMember (HTTPS Callable)
// Owner only. Sets isActive = false on WorkspaceMember. Clears JWT claims.
// Does NOT delete the document (preserves audit trail).
// Cannot be used to revoke the Owner's own access.
// =============================================================================

export interface RevokeMemberDto {
  workspaceId: string;
  userId: string;
}
