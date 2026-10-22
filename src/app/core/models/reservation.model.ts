import { Timestamp } from 'firebase/firestore';
import { SoftDeletable } from './base.model';
import { PaymentStatus, PriceUnit, ReservationStatus, ResourceType } from './enums';
import { RecurrenceRule } from './recurrence.model';

// =============================================================================
// EMBEDDED OBJECTS
// These are not standalone Firestore documents. They are embedded within
// the Reservation document and have no independent lifecycle.
// =============================================================================

/**
 * Customer information captured at reservation time.
 * Stored as an embedded object — not a reference to a separate customer collection.
 * GDPR erasure: anonymise name → '[REDACTED]', phone → '[REDACTED]' via admin CF.
 */
export interface CustomerRecord {
  name: string;
  phone: string;
  email: string | null;

  /** Internal note about the customer (e.g. 'VIP', 'Regular guest'). */
  notes: string | null;
}

/**
 * Immutable price snapshot captured at reservation creation time.
 * Never recomputed if the resource's basePrice changes after booking.
 */
export interface PriceSnapshot {
  /** Total amount = basePrice × quantity. */
  amount: number;

  /** ISO 4217 currency code copied from workspace at creation time. */
  currency: string;

  unit: PriceUnit;

  /** Number of nights, hours, or days. 1 for FLAT_RATE. */
  quantity: number;

  /** Unit price at time of booking. */
  basePrice: number;
}

/**
 * Deposit tracking. null on the Reservation means no deposit is required.
 */
export interface DepositRecord {
  amount: number;
  status: PaymentStatus;
}

// =============================================================================
// RESERVATION DOCUMENT
// Firestore path: /workspaces/{workspaceId}/reservations/{reservationId}
//
// WRITE PATH: Cloud Function only. Never written directly by the client SDK.
// READ PATH:  Firestore SDK real-time listener.
//
// Document ID: Auto-generated Firestore ID.
// =============================================================================

export interface Reservation extends SoftDeletable {
  reservationId: string;

  /** Authenticated customer who submitted a public booking request, when applicable. */
  requesterUid?: string;

  /** Reference to the resource being booked. */
  resourceId: string;

  /**
   * Denormalized resource name at write time.
   * Never updated retroactively if the resource is renamed.
   * Enables list and calendar rendering without additional reads.
   */
  resourceName: string;

  /**
   * Denormalized resource type at write time.
   * Enables type-specific rendering logic without joining the resource.
   */
  resourceType: ResourceType;

  /**
   * For DATE_RANGE resources: midnight of check-in date in workspace timezone.
   * For DATETIME_RANGE resources: exact start datetime.
   */
  start: Timestamp;

  /**
   * For DATE_RANGE resources: midnight of check-out date (exclusive).
   * For DATETIME_RANGE resources: exact end datetime.
   */
  end: Timestamp;

  /**
   * Check-in date as YYYY-MM-DD string. Populated for DATE_RANGE resources only.
   * null for DATETIME_RANGE resources.
   * Used for timezone-safe calendar range queries.
   */
  startDate: string | null;

  /**
   * Check-out date as YYYY-MM-DD string. Populated for DATE_RANGE resources only.
   * null for DATETIME_RANGE resources.
   */
  endDate: string | null;

  status: ReservationStatus;

  /** Payment method used for this reservation (e.g. Cash, OMT, Wish). */
  paymentMethod: string | null;

  /** Payment lifecycle for the reservation. Defaults to unpaid when created. */
  paymentStatus: PaymentStatus;

  customer: CustomerRecord;

  price: PriceSnapshot;

  /** null if no deposit is required or tracked for this reservation. */
  deposit: DepositRecord | null;

  /** Internal staff notes. Visible only within the workspace. */
  notes: string | null;

  /** Firebase Storage URLs for files attached to this reservation. */
  attachmentUrls: string[];

  /** Shared by every booking created from the same recurrence. Absent on one-off bookings. */
  seriesId?: string | null;

  /** 1-based position inside the series. */
  occurrenceIndex?: number | null;

  /** Number of bookings created for the series. Fixed at creation time. */
  occurrenceCount?: number | null;

  recurrence?: RecurrenceRule | null;

  /** UID of the member who created the reservation. */
  createdBy: string;
  createdAt: Timestamp;

  /** UID of the member who last modified the reservation. */
  updatedBy: string;
  updatedAt: Timestamp;

  /** Populated when status transitions to CANCELLED. */
  cancelledBy: string | null;
  cancelledAt: Timestamp | null;
  cancellationReason: string | null;

  /** Populated when status transitions to DELETED. Inherited from SoftDeletable. */
  deletedAt: Timestamp | null;
  deletedBy: string | null;
  deletionReason: string | null;
}
