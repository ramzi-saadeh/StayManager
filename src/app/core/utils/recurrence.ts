import { RecurrenceFrequency, ReservationStatus } from '../models/enums';
import { RecurrenceRule, Weekday } from '../models/recurrence.model';
import { Reservation } from '../models/reservation.model';

export const RECURRENCE_MAX_OCCURRENCES = 52;
export const RECURRENCE_MAX_INTERVAL = 12;

export interface RecurrenceOccurrence {
  /** 1-based. The first occurrence is always the booking the user entered. */
  index: number;
  start: Date;
  end: Date;
}

export type RecurrenceRuleError = 'INTERVAL' | 'COUNT' | 'UNTIL';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function getRecurrenceRuleError(rule: RecurrenceRule): RecurrenceRuleError | null {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > RECURRENCE_MAX_INTERVAL) {
    return 'INTERVAL';
  }
  if (rule.end.type === 'COUNT') {
    const { count } = rule.end;
    return Number.isInteger(count) && count >= 2 && count <= RECURRENCE_MAX_OCCURRENCES ? null : 'COUNT';
  }
  return parseDateOnly(rule.end.date) ? null : 'UNTIL';
}

/**
 * Strips fields that do not apply to the frequency. Firestore rejects `undefined` values,
 * so a rule must be normalized before it is stored.
 */
export function normalizeRecurrenceRule(rule: RecurrenceRule): RecurrenceRule {
  const base = { frequency: rule.frequency, interval: rule.interval, end: { ...rule.end } };
  if (rule.frequency !== RecurrenceFrequency.WEEKLY) return base;
  return { ...base, weekdays: [...new Set(rule.weekdays ?? [])].sort((a, b) => a - b) };
}

/**
 * Bookings of a series that an edit or cancellation with SERIES scope applies to:
 * every active booking that has not ended yet, plus the one being acted on.
 */
export function selectSeriesTargets(
  members: Reservation[],
  currentReservationId: string,
  now: number,
): Reservation[] {
  return members.filter(
    (member) =>
      !member.deletedAt &&
      (member.status === ReservationStatus.PENDING || member.status === ReservationStatus.CONFIRMED) &&
      (member.reservationId === currentReservationId || member.end.toMillis() > now),
  );
}

/**
 * Expands a rule into concrete bookings. Dates are computed on the local calendar and the
 * time of day is carried over, so DST changes never shift a booking by an hour.
 * Result is capped at RECURRENCE_MAX_OCCURRENCES.
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  first: { start: Date; end: Date },
): RecurrenceOccurrence[] {
  const firstDay = startOfDay(first.start);
  const spanDays = daysBetween(firstDay, startOfDay(first.end));
  const until = rule.end.type === 'UNTIL' ? parseDateOnly(rule.end.date) : null;
  const limit = rule.end.type === 'COUNT'
    ? Math.min(rule.end.count, RECURRENCE_MAX_OCCURRENCES)
    : RECURRENCE_MAX_OCCURRENCES;

  const occurrences: RecurrenceOccurrence[] = [];
  for (const day of candidateDays(rule, firstDay)) {
    if (occurrences.length >= limit) break;
    if (until && occurrences.length > 0 && day > until) break;

    occurrences.push({
      index: occurrences.length + 1,
      start: withTimeOf(day, first.start),
      end: withTimeOf(addDays(day, spanDays), first.end),
    });
  }
  return occurrences;
}

/** Lazily yields every matching day starting with `firstDay` itself. */
function* candidateDays(rule: RecurrenceRule, firstDay: Date): Generator<Date> {
  const interval = Math.max(1, rule.interval);

  switch (rule.frequency) {
    case RecurrenceFrequency.DAILY:
      for (let step = 0; ; step++) yield addDays(firstDay, step * interval);

    case RecurrenceFrequency.WEEKLY: {
      const weekdays = new Set<Weekday>([...(rule.weekdays ?? []), firstDay.getDay() as Weekday]);
      const weekAnchor = addDays(firstDay, -firstDay.getDay());
      for (let week = 0; ; week += interval) {
        for (let weekday = 0; weekday < 7; weekday++) {
          if (!weekdays.has(weekday as Weekday)) continue;
          const day = addDays(weekAnchor, week * 7 + weekday);
          if (day >= firstDay) yield day;
        }
      }
    }

    case RecurrenceFrequency.MONTHLY:
      // Month-end clamp is computed from the original day, so Jan 31 -> Feb 28 -> Mar 31.
      for (let step = 0; ; step++) {
        const monthIndex = firstDay.getMonth() + step * interval;
        const lastDay = new Date(firstDay.getFullYear(), monthIndex + 1, 0).getDate();
        yield new Date(firstDay.getFullYear(), monthIndex, Math.min(firstDay.getDate(), lastDay));
      }
  }
}

export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? date : null;
}

export function toDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function withTimeOf(day: Date, time: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
    time.getSeconds(),
    time.getMilliseconds(),
  );
}

function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}
