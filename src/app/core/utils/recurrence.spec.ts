import { RecurrenceFrequency } from '../models/enums';
import { RecurrenceRule } from '../models/recurrence.model';
import {
  RECURRENCE_MAX_OCCURRENCES,
  expandRecurrence,
  getRecurrenceRuleError,
  parseDateOnly,
  toDateOnly,
} from './recurrence';

const days = (occurrences: { start: Date }[]) => occurrences.map((o) => toDateOnly(o.start));

// 2026-01-05 is a Monday.
const monday = (hour = 9) => ({
  start: new Date(2026, 0, 5, hour, 0),
  end: new Date(2026, 0, 5, hour + 1, 30),
});

describe('expandRecurrence', () => {
  it('repeats weekly on the weekday of the first booking', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      end: { type: 'COUNT', count: 4 },
    };

    expect(days(expandRecurrence(rule, monday()))).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ]);
  });

  it('always includes the weekday of the first booking when more weekdays are chosen', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      weekdays: [3],
      end: { type: 'COUNT', count: 4 },
    };

    expect(days(expandRecurrence(rule, monday()))).toEqual([
      '2026-01-05',
      '2026-01-07',
      '2026-01-12',
      '2026-01-14',
    ]);
  });

  it('skips weeks according to the interval', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 2,
      end: { type: 'COUNT', count: 3 },
    };

    expect(days(expandRecurrence(rule, monday()))).toEqual(['2026-01-05', '2026-01-19', '2026-02-02']);
  });

  it('repeats daily every N days', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.DAILY,
      interval: 3,
      end: { type: 'COUNT', count: 3 },
    };

    expect(days(expandRecurrence(rule, monday()))).toEqual(['2026-01-05', '2026-01-08', '2026-01-11']);
  });

  it('clamps monthly bookings to the last day of shorter months without drifting', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.MONTHLY,
      interval: 1,
      end: { type: 'COUNT', count: 4 },
    };
    const first = { start: new Date(2026, 0, 31, 10), end: new Date(2026, 1, 2, 12) };

    expect(days(expandRecurrence(rule, first))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('stops at the UNTIL date, inclusive', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      end: { type: 'UNTIL', date: '2026-01-19' },
    };

    expect(days(expandRecurrence(rule, monday()))).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('keeps the first booking even when UNTIL is before it', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.DAILY,
      interval: 1,
      end: { type: 'UNTIL', date: '2025-12-01' },
    };

    expect(days(expandRecurrence(rule, monday()))).toEqual(['2026-01-05']);
  });

  it('caps the series length', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.DAILY,
      interval: 1,
      end: { type: 'UNTIL', date: '2099-12-31' },
    };

    expect(expandRecurrence(rule, monday())).toHaveLength(RECURRENCE_MAX_OCCURRENCES);
  });

  it('keeps the local time of day and the booking length across a DST change', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      end: { type: 'COUNT', count: 40 },
    };

    for (const occurrence of expandRecurrence(rule, monday(9))) {
      expect(occurrence.start.getHours()).toBe(9);
      expect(occurrence.end.getHours()).toBe(10);
      expect(occurrence.end.getMinutes()).toBe(30);
    }
  });

  it('preserves the night count of multi-day bookings', () => {
    const rule: RecurrenceRule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      end: { type: 'COUNT', count: 3 },
    };
    const first = { start: new Date(2026, 0, 5), end: new Date(2026, 0, 8) };

    expect(expandRecurrence(rule, first).map((o) => toDateOnly(o.end))).toEqual([
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
    ]);
  });
});

describe('getRecurrenceRuleError', () => {
  const base: RecurrenceRule = {
    frequency: RecurrenceFrequency.WEEKLY,
    interval: 1,
    end: { type: 'COUNT', count: 4 },
  };

  it('accepts a valid rule', () => {
    expect(getRecurrenceRuleError(base)).toBeNull();
  });

  it('rejects an invalid interval, count and date', () => {
    expect(getRecurrenceRuleError({ ...base, interval: 0 })).toBe('INTERVAL');
    expect(getRecurrenceRuleError({ ...base, end: { type: 'COUNT', count: 1 } })).toBe('COUNT');
    expect(getRecurrenceRuleError({ ...base, end: { type: 'COUNT', count: 500 } })).toBe('COUNT');
    expect(getRecurrenceRuleError({ ...base, end: { type: 'UNTIL', date: '2026-02-31' } })).toBe('UNTIL');
  });
});

describe('parseDateOnly', () => {
  it('rejects overflowing dates', () => {
    expect(parseDateOnly('2026-02-31')).toBeNull();
    expect(parseDateOnly('2026-02-28')).not.toBeNull();
  });
});
