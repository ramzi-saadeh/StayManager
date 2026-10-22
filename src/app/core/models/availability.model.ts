import { Timestamp } from 'firebase/firestore';
import { AvailabilityType } from './enums';

/**
 * Day-of-week index following the JavaScript Date convention.
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A single day's schedule entry within a WeeklySchedule.
 */
export interface DaySchedule {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;

  /** 24-hour time string. e.g. '08:00', '23:30'. null when isOpen = false. */
  openTime: string | null;

  /** 24-hour time string. e.g. '22:00'. null when isOpen = false. */
  closeTime: string | null;
}

// =============================================================================
// WEEKLY SCHEDULE
// Firestore path: /workspaces/{workspaceId}/resources/{resourceId}/availability/weekly_schedule
// Document ID: 'weekly_schedule' (convention — one per resource)
// =============================================================================

export interface WeeklySchedule {
  /** Always 'weekly_schedule'. Discriminant for the Availability union. */
  availabilityId: 'weekly_schedule';

  type: AvailabilityType.WEEKLY_SCHEDULE;

  /**
   * Exactly 7 entries, one per day of the week (Sunday–Saturday).
   * Ordered by dayOfWeek ascending.
   */
  schedule: DaySchedule[];

  /** UID of the member who last updated the schedule. */
  updatedBy: string;
  updatedAt: Timestamp;
}

// =============================================================================
// BLOCKED PERIOD
// Firestore path: /workspaces/{workspaceId}/resources/{resourceId}/availability/{autoId}
// Document ID: Auto-generated Firestore ID.
// =============================================================================

/**
 * A one-time date range during which the resource is unavailable.
 *
 * Date fields use YYYY-MM-DD strings instead of Timestamps for timezone-safe
 * calendar comparison. For DATE_RANGE resources, the dates are compared
 * directly against reservation startDate/endDate strings.
 *
 * For DATETIME_RANGE resources where a blocked period must cover specific
 * hours, use startDateTime/endDateTime Timestamps (Phase 2 extension).
 */
export interface BlockedPeriod {
  availabilityId: string;
  type: AvailabilityType.BLOCKED_PERIOD;

  /** Inclusive start date. YYYY-MM-DD. */
  startDate: string;

  /** Inclusive end date. YYYY-MM-DD. */
  endDate: string;

  /** Optional internal note visible to staff (e.g. 'Maintenance', 'Owner personal use'). */
  reason: string | null;

  /** UID of the member who created this blocked period. */
  createdBy: string;
  createdAt: Timestamp;
}

/**
 * Discriminated union of all availability document types within a resource's
 * availability subcollection.
 */
export type Availability = WeeklySchedule | BlockedPeriod;
