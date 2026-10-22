import { Timestamp } from 'firebase/firestore';
import { AuditAction, ReservationStatus } from './enums';

/**
 * A before/after record for a single field change.
 * Used in UPDATED audit entries to provide field-level diffs.
 */
export interface FieldChange<T = unknown> {
  from: T;
  to: T;
}

/**
 * Firestore path: /workspaces/{workspaceId}/reservations/{reservationId}/auditLog/{logId}
 *
 * Append-only. Entries are NEVER mutated after initial write.
 * Written exclusively by Cloud Functions as part of every reservation state transition.
 *
 * Document ID: Auto-generated Firestore ID (ordered by Timestamp in queries).
 */
export interface AuditLogEntry {
  logId: string;

  action: AuditAction;

  /** Status before this transition. null for CREATED action. */
  previousStatus: ReservationStatus | null;

  /** Status after this transition. null for non-status-changing actions (UPDATED, NOTE_ADDED, etc.). */
  newStatus: ReservationStatus | null;

  /**
   * Field-level diff for UPDATED actions.
   * Keys are field names on the Reservation document.
   * null for actions that do not change document fields (e.g. pure status transitions).
   *
   * Example: { "notes": { from: null, to: "Needs parking" } }
   */
  changes: Record<string, FieldChange> | null;

  /** UID of the workspace member who performed this action. */
  performedBy: string;

  performedAt: Timestamp;

  /** Optional human-readable note attached to this audit entry (e.g. cancellation reason). */
  note: string | null;
}
