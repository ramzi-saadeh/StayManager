import { RecurrenceFrequency } from './enums';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RecurrenceEnd =
  /** Total number of bookings in the series, including the first one. */
  | { type: 'COUNT'; count: number }
  /** Last allowed start date, inclusive. YYYY-MM-DD. */
  | { type: 'UNTIL'; date: string };

/**
 * Recurrence pattern stored on every reservation of a series.
 * The first booking is always the one the user entered; later ones follow this rule.
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;

  /** Repeat every N days / weeks / months. */
  interval: number;

  /**
   * WEEKLY only. Days of the week (0 = Sunday) the booking repeats on.
   * The weekday of the first booking is always included implicitly.
   */
  weekdays?: Weekday[];

  end: RecurrenceEnd;
}

/** Scope of an edit or cancellation applied to a reservation that belongs to a series. */
export type SeriesScope = 'THIS' | 'SERIES';
