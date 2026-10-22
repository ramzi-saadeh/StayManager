// =============================================================================
// WORKSPACE ENUMS
// =============================================================================

export enum WorkspaceRole {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
  VIEWER = 'VIEWER',
}

export enum WorkspacePlan {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum WorkspaceStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

/**
 * Default calendar display mode for the workspace.
 *
 * MONTH: Best for DATE_RANGE businesses (chalets, guest houses, camps).
 *        Shows a monthly grid — reservations span multiple days.
 *
 * DAY:   Best for DATETIME_RANGE businesses (football fields, meeting rooms).
 *        Shows a timeline/Gantt view — reservations span hours within a day.
 */
export enum CalendarViewMode {
  MONTH    = 'month',
  WEEK     = 'week',
  TIMELINE = 'timeline',
}

// =============================================================================
// RESOURCE ENUMS
// =============================================================================

export enum ResourceType {
  GUEST_HOUSE = 'GUEST_HOUSE',
  CHALET = 'CHALET',
  FOOTBALL_FIELD = 'FOOTBALL_FIELD',
  MEETING_ROOM = 'MEETING_ROOM',
  CAMP = 'CAMP',
  EVENT_VENUE = 'EVENT_VENUE',
}

/**
 * Determines the unit of time used for availability and conflict detection.
 *
 * DATE_RANGE:     Check-in / check-out by calendar date (e.g. Guest House, Chalet, Camp).
 *                 Timestamps represent midnight of the respective dates in the workspace timezone.
 *
 * DATETIME_RANGE: Start / end by exact datetime (e.g. Football Field, Meeting Room, Event Venue).
 *                 Timestamps carry full precision.
 *
 * IMPORTANT: This field is immutable once the first reservation exists on the resource.
 */
export enum BookingMode {
  DATE_RANGE = 'DATE_RANGE',
  DATETIME_RANGE = 'DATETIME_RANGE',
}

export enum PriceUnit {
  PER_NIGHT = 'PER_NIGHT',
  PER_HOUR = 'PER_HOUR',
  PER_DAY = 'PER_DAY',
  FLAT_RATE = 'FLAT_RATE',
}

export enum RecurrenceFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

// =============================================================================
// AVAILABILITY ENUMS
// =============================================================================

export enum AvailabilityType {
  WEEKLY_SCHEDULE = 'WEEKLY_SCHEDULE',
  BLOCKED_PERIOD = 'BLOCKED_PERIOD',
}

export enum ThemeMode {
  LIGHT = 'LIGHT',
  MIDNIGHT = 'MIDNIGHT',
  FOREST = 'FOREST',
}

// =============================================================================
// RESERVATION ENUMS
// =============================================================================

/**
 * Reservation status lifecycle:
 *
 *   PENDING ──► CONFIRMED ──► COMPLETED
 *      │              │
 *      └──────────────┴──► CANCELLED ──► DELETED
 *                                            ▲
 *                           COMPLETED ───────┘
 *
 * PENDING:   Created but awaiting confirmation. Blocks availability (Policy A).
 *            Used in MVP for Owner-created reservations only as a transient state.
 *            Reserved for future: public booking requests, payment-gated holds.
 *
 * CONFIRMED: Approved and blocks availability. MVP default after creation.
 *
 * COMPLETED: Reservation period finished. Terminal state unless soft-deleted.
 *
 * CANCELLED: Was PENDING or CONFIRMED, then cancelled.
 *
 * DELETED:   Soft-deleted. Terminal state. Never hard-deleted.
 *            Reachable only from CANCELLED or COMPLETED.
 *
 * Conflict detection queries filter: status IN [PENDING, CONFIRMED].
 * All UI queries filter out DELETED by default.
 */
export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DELETED = 'DELETED',
}

/** Active statuses that block resource availability. */
export const BLOCKING_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

// =============================================================================
// MEMBER / INVITATION ENUMS
// =============================================================================

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

// =============================================================================
// AUDIT LOG ENUMS
// =============================================================================

export enum AuditAction {
  CREATED = 'CREATED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DELETED = 'DELETED',
  UPDATED = 'UPDATED',
  NOTE_ADDED = 'NOTE_ADDED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
}
