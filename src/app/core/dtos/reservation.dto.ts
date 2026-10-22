import { BookingMode, PaymentStatus, ReservationStatus, ResourceType } from '../models/enums';
import { RecurrenceRule } from '../models/recurrence.model';
import { CustomerRecord, DepositRecord, PriceSnapshot } from '../models/reservation.model';

// =============================================================================
// CREATE RESERVATION
// Cloud Function: createReservation (HTTPS Callable)
//
// Two variants based on the resource's bookingMode. The Cloud Function
// validates that the submitted variant matches the resource's actual bookingMode.
// =============================================================================

interface CreateReservationBase {
  workspaceId: string;
  resourceId: string;
  customer: CustomerRecord;
  /** True when reservation is submitted through a public booking page. */
  isPublicRequest?: boolean;
  paymentStatus?: PaymentStatus;
  paymentMethod?: string | null;
  deposit?: DepositRecord;
  notes?: string;

  /** Denormalized onto the reservation so lists need no extra resource read. */
  resourceName?: string;
  resourceType?: ResourceType;

  /** Price of each booking. For a series every occurrence gets the same snapshot. */
  price?: PriceSnapshot;

  /**
   * Creates a series. Owner/staff bookings only. Payment status, payment method and deposit
   * apply to the first booking; the rest start UNPAID.
   */
  recurrence?: RecurrenceRule;

  /** Series only. When false, any unavailable date rejects the whole series. */
  skipConflictingOccurrences?: boolean;

  /** Client-generated key used to safely retry a create request. */
  idempotencyKey?: string;
}

/**
 * For DATE_RANGE resources (Guest House, Chalet, Camp, etc.).
 * Dates are YYYY-MM-DD strings. The CF converts them to midnight Timestamps
 * in the workspace timezone.
 */
export interface CreateDateRangeReservationDto extends CreateReservationBase {
  bookingMode: BookingMode.DATE_RANGE;

  /** Check-in date. YYYY-MM-DD. */
  startDate: string;

  /** Check-out date. YYYY-MM-DD. Must be after startDate. */
  endDate: string;
}

/**
 * For DATETIME_RANGE resources (Football Field, Meeting Room, Event Venue, etc.).
 * Datetimes are ISO 8601 strings with timezone offset. e.g. '2026-08-01T09:00:00+03:00'.
 */
export interface CreateDateTimeRangeReservationDto extends CreateReservationBase {
  bookingMode: BookingMode.DATETIME_RANGE;

  /** ISO 8601 datetime string with timezone offset. */
  start: string;

  /** ISO 8601 datetime string with timezone offset. Must be after start. */
  end: string;
}

export type CreateReservationDto =
  | CreateDateRangeReservationDto
  | CreateDateTimeRangeReservationDto;

export interface CreateReservationResponseData {
  /** The only reservation for one-off bookings, the first occurrence for a series. */
  reservationId: string;
  seriesId?: string;
  createdCount?: number;
  skippedCount?: number;
}

/** The date part of a create request; shared by creation and series preview. */
export type BookingWindowDto =
  | Pick<CreateDateRangeReservationDto, 'bookingMode' | 'startDate' | 'endDate'>
  | Pick<CreateDateTimeRangeReservationDto, 'bookingMode' | 'start' | 'end'>;

export type SeriesPreviewRequest = BookingWindowDto & {
  workspaceId: string;
  resourceId: string;
  recurrence: RecurrenceRule;
};

export type SeriesOccurrenceStatus = 'OK' | 'CONFLICT' | 'BLOCKED';

export interface SeriesOccurrencePreview {
  index: number;
  start: Date;
  end: Date;
  startDate: string | null;
  endDate: string | null;
  status: SeriesOccurrenceStatus;
  /** Set when status is BLOCKED: workspace rule message. */
  reason?: string;
}

// =============================================================================
// EDIT / CANCEL WITH SERIES SCOPE
// =============================================================================

/** Fields that can be edited on an upcoming reservation or on a whole series. */
export interface UpdateReservationDetailsDto {
  customer: Pick<CustomerRecord, 'name' | 'phone' | 'email'>;
  notes: string | null;
  /** Price of each affected booking. */
  priceAmount: number;
}

// =============================================================================
// UPDATE RESERVATION STATUS
// Cloud Function: updateReservationStatus (HTTPS Callable)
//
// Enforces the status lifecycle on the server:
//   PENDING   → CONFIRMED, CANCELLED
//   CONFIRMED → COMPLETED, CANCELLED
//   COMPLETED → DELETED
//   CANCELLED → DELETED
//
// PENDING and CONFIRMED cannot transition directly to DELETED.
// =============================================================================

export type UpdatableReservationStatus =
  | ReservationStatus.CONFIRMED
  | ReservationStatus.COMPLETED
  | ReservationStatus.CANCELLED
  | ReservationStatus.DELETED;

export interface UpdateReservationStatusDto {
  workspaceId: string;
  reservationId: string;
  status: UpdatableReservationStatus;

  /** Required when transitioning to CANCELLED. Optional for other transitions. */
  reason?: string;

  /** Optional human note appended to the audit log entry. */
  note?: string;
}

// =============================================================================
// UPDATE RESERVATION NOTES
// Cloud Function: updateReservationNotes (HTTPS Callable)
// Separate from status update to produce a distinct AuditAction.NOTE_ADDED entry.
// =============================================================================

export interface UpdateReservationNotesDto {
  workspaceId: string;
  reservationId: string;
  notes: string;
}

// =============================================================================
// ADD RESERVATION ATTACHMENT
// Cloud Function: addReservationAttachment (HTTPS Callable)
// Called after the file has been uploaded to Firebase Storage.
// =============================================================================

export interface AddReservationAttachmentDto {
  workspaceId: string;
  reservationId: string;

  /** Firebase Storage download URL of the already-uploaded file. */
  attachmentUrl: string;
}

// =============================================================================
// RESERVATION LIST FILTERS
// Used by ReservationService for Firestore SDK queries (client-side).
// Not a Cloud Function DTO — used purely for Angular service query construction.
// =============================================================================

export interface ReservationFilters {
  resourceId?: string;
  status?: ReservationStatus[];

  /** YYYY-MM-DD inclusive lower bound on startDate (DATE_RANGE) or start (DATETIME_RANGE). */
  fromDate?: string;

  /** YYYY-MM-DD inclusive upper bound. */
  toDate?: string;
}
