import { randomUUID } from 'node:crypto';
import { getFirestore, Timestamp, FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { z } from 'zod';
import { REQUIRE_EMAIL_VERIFICATION } from './auth-policy.js';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
const activeStatuses = new Set(['PENDING', 'CONFIRMED']);
const validTransitions: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['DELETED'],
  CANCELLED: ['DELETED'],
};

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const priceSchema = z.object({
  amount: z.number().finite().min(0).max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  quantity: z.number().finite().positive().max(10_000),
  basePrice: z.number().finite().min(0).max(1_000_000_000),
  unit: z.enum(['PER_NIGHT', 'PER_HOUR', 'PER_DAY', 'FLAT_RATE']),
});

const createSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  resourceId: z.string().min(1).max(128),
  bookingMode: z.enum(['DATE_RANGE', 'DATETIME_RANGE']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  resourceName: z.string().max(200).optional(),
  resourceType: z.string().max(100).optional(),
  customer: customerSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  price: priceSchema.optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
  paymentMethod: z.string().trim().max(80).nullable().optional(),
  deposit: z.object({
    amount: z.number().finite().min(0).max(1_000_000_000),
    status: z.enum(['UNPAID', 'PARTIAL', 'PAID']),
  }).nullable().optional(),
  isPublicRequest: z.boolean().optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/).optional(),
  recurrence: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    interval: z.number().int().min(1).max(12),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    end: z.discriminatedUnion('type', [
      z.object({ type: z.literal('COUNT'), count: z.number().int().min(2).max(52) }),
      z.object({ type: z.literal('UNTIL'), date: z.string() }),
    ]),
  }).optional(),
  skipConflictingOccurrences: z.boolean().optional(),
}).strict();

const statusSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  reservationId: z.string().min(1).max(128),
  status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED', 'DELETED']),
  reason: z.string().trim().max(1000).nullable().optional(),
  scope: z.enum(['THIS', 'SERIES']).optional(),
}).strict();

const paymentSchema = z.object({
  workspaceId: z.string().min(1).max(128),
  reservationId: z.string().min(1).max(128),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']),
  paymentMethod: z.string().trim().max(80).optional(),
}).strict();

type CreateInput = z.infer<typeof createSchema>;
type Window = { start: Timestamp; end: Timestamp; startDate: string | null; endDate: string | null };
type Occurrence = Window & { index: number };

function fail(
  code: ConstructorParameters<typeof HttpsError>[0],
  message: string,
  appCode?: string,
  details?: Record<string, string>,
): never {
  const normalized = appCode ?? ({
    unauthenticated: 'UNAUTHORIZED',
    'permission-denied': 'FORBIDDEN',
    'invalid-argument': 'VALIDATION_ERROR',
    'already-exists': 'RESERVATION_CONFLICT',
    'failed-precondition': 'INVALID_STATUS_TRANSITION',
    'not-found': 'RESERVATION_NOT_FOUND',
  } as Record<string, string>)[code] ?? 'INTERNAL_ERROR';
  throw new HttpsError(code, message, {
    success: false,
    code: normalized,
    message,
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {}),
  });
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('invalid-argument', 'Dates must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) fail('invalid-argument', 'Invalid calendar date.');
  return date;
}

function resolveWindow(input: CreateInput): Window {
  if (input.bookingMode === 'DATE_RANGE') {
    if (!input.startDate || !input.endDate) fail('invalid-argument', 'Check-in and check-out are required.');
    const startDate = input.startDate;
    const endDate = input.endDate;
    return {
      start: Timestamp.fromDate(parseDateOnly(startDate)),
      end: Timestamp.fromDate(parseDateOnly(endDate)),
      startDate,
      endDate,
    };
  }

  if (!input.start || !input.end) fail('invalid-argument', 'Start and end times are required.');
  const hasOffset = (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!hasOffset(input.start) || !hasOffset(input.end)) {
    fail('invalid-argument', 'Date-time values must include a timezone offset.');
  }
  const startDate = new Date(input.start);
  const endDate = new Date(input.end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    fail('invalid-argument', 'Invalid date-time.');
  }
  return {
    start: Timestamp.fromDate(startDate),
    end: Timestamp.fromDate(endDate),
    startDate: null,
    endDate: null,
  };
}

type LocalDateTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timeZone: string): LocalDateTime & { weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekdayName = value('weekday');
  const result: LocalDateTime & { weekday: number } = {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    second: Number(value('second')),
    weekday: weekdayName ? weekdays[weekdayName] : -1,
  };
  if (Object.values(result).some((part) => !Number.isInteger(part)) || result.weekday < 0) {
    fail('invalid-argument', 'Invalid workspace timezone.');
  }
  return result;
}

function localDateString(date: LocalDateTime): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function utcDate(date: string): Date {
  const parsed = parseDateOnly(date);
  return parsed;
}

function addCalendarDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + count);
  return next;
}

function addCalendarMonths(date: Date, count: number, anchorDay: number): Date {
  const monthIndex = date.getUTCMonth() + count;
  const year = date.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
}

function calendarDates(
  first: Date,
  rule: NonNullable<CreateInput['recurrence']>,
): Date[] {
  const untilDate = rule.end.type === 'UNTIL' ? parseDateOnly(rule.end.date) : null;
  if (rule.end.type === 'UNTIL' && !untilDate) fail('invalid-argument', 'Recurrence end date is invalid.');
  const limit = rule.end.type === 'COUNT' ? rule.end.count : 52;
  const result: Date[] = [];
  const addCandidate = (candidate: Date): boolean => {
    if (untilDate && result.length > 0 && candidate > untilDate) return false;
    result.push(candidate);
    return result.length < limit;
  };

  if (rule.frequency === 'DAILY') {
    for (let step = 0; result.length < limit; step++) {
      if (!addCandidate(addCalendarDays(first, step * rule.interval))) break;
    }
  } else if (rule.frequency === 'MONTHLY') {
    const anchorDay = first.getUTCDate();
    for (let step = 0; result.length < limit; step++) {
      if (!addCandidate(addCalendarMonths(first, step * rule.interval, anchorDay))) break;
    }
  } else {
    const weekdays = new Set([...(rule.weekdays ?? []), first.getUTCDay()]);
    const weekAnchor = addCalendarDays(first, -first.getUTCDay());
    for (let week = 0; result.length < limit; week += rule.interval) {
      for (let weekday = 0; weekday < 7 && result.length < limit; weekday++) {
        if (!weekdays.has(weekday)) continue;
        const candidate = addCalendarDays(weekAnchor, week * 7 + weekday);
        if (candidate < first) continue;
        if (!addCandidate(candidate)) return result;
      }
    }
  }
  return result;
}

function localDateTimeToTimestamp(local: LocalDateTime, timeZone: string): Timestamp {
  const desiredUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const representedUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += desiredUtc - representedUtc;
  }
  const result = new Date(candidate);
  const verified = zonedParts(result, timeZone);
  if (
    verified.year !== local.year || verified.month !== local.month || verified.day !== local.day
    || verified.hour !== local.hour || verified.minute !== local.minute || verified.second !== local.second
  ) {
    fail('invalid-argument', 'A recurring booking falls on a local time that does not exist because of a clock change.');
  }
  return Timestamp.fromDate(result);
}

function expandOccurrences(input: CreateInput, first: Window, timeZone: string): Occurrence[] {
  if (!input.recurrence) return [{ ...first, index: 1 }];
  if (input.isPublicRequest) fail('invalid-argument', 'Public booking requests cannot repeat.');
  const recurrence = input.recurrence;
  const initialDate = input.bookingMode === 'DATE_RANGE'
    ? parseDateOnly(first.startDate!)
    : utcDate(localDateString(zonedParts(first.start.toDate(), timeZone)));
  const dates = calendarDates(initialDate, recurrence);

  if (input.bookingMode === 'DATE_RANGE') {
    const spanDays = (first.end.toMillis() - first.start.toMillis()) / 86_400_000;
    return dates.map((date, offset) => {
      const startDate = date.toISOString().slice(0, 10);
      const endDate = addCalendarDays(date, spanDays).toISOString().slice(0, 10);
      return {
        index: offset + 1,
        startDate,
        endDate,
        start: Timestamp.fromDate(parseDateOnly(startDate)),
        end: Timestamp.fromDate(parseDateOnly(endDate)),
      };
    });
  }

  const startLocal = zonedParts(first.start.toDate(), timeZone);
  const endLocal = zonedParts(first.end.toDate(), timeZone);
  const wallStart = Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day, startLocal.hour, startLocal.minute, startLocal.second);
  const wallEnd = Date.UTC(endLocal.year, endLocal.month - 1, endLocal.day, endLocal.hour, endLocal.minute, endLocal.second);
  const wallDuration = wallEnd - wallStart;
  if (wallDuration <= 0 || wallDuration > 31 * 86_400_000) fail('invalid-argument', 'Invalid recurring booking duration.');

  return dates.map((date, offset) => {
    const startLocalDate = date.toISOString().slice(0, 10);
    const [year, month, day] = startLocalDate.split('-').map(Number);
    const localStart: LocalDateTime = { year, month, day, hour: startLocal.hour, minute: startLocal.minute, second: startLocal.second };
    const endDateTime = new Date(Date.UTC(year, month - 1, day, startLocal.hour, startLocal.minute, startLocal.second) + wallDuration);
    const localEnd: LocalDateTime = {
      year: endDateTime.getUTCFullYear(),
      month: endDateTime.getUTCMonth() + 1,
      day: endDateTime.getUTCDate(),
      hour: endDateTime.getUTCHours(),
      minute: endDateTime.getUTCMinutes(),
      second: endDateTime.getUTCSeconds(),
    };
    const start = localDateTimeToTimestamp(localStart, timeZone);
    const end = localDateTimeToTimestamp(localEnd, timeZone);
    return { index: offset + 1, start, end, startDate: null, endDate: null };
  });
}

function localParts(date: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  if (!weekday || weekdays[weekday] === undefined || !Number.isInteger(hour)) {
    fail('invalid-argument', 'Invalid workspace timezone.');
  }
  return { weekday: weekdays[weekday], hour };
}

function workspaceRuleViolation(workspace: DocumentData, bookingMode: string, window: Window): string | null {
  const rules = workspace.workspaceSettings?.operatingRules;
  if (!rules) return null;
  const workingDays = new Set<number>(rules.workingDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const blockedDays = new Set<number>(rules.blockedDays ?? []);
  const blockedHours = new Set<number>(rules.blockedHours ?? []);

  if (bookingMode === 'DATE_RANGE' && window.startDate && window.endDate) {
    for (let day = parseDateOnly(window.startDate); day < parseDateOnly(window.endDate); day.setUTCDate(day.getUTCDate() + 1)) {
      const weekday = day.getUTCDay();
      if (!workingDays.has(weekday)) return 'Selected dates include non-working days in workspace settings.';
      if (blockedDays.has(weekday)) return 'Selected dates include blocked days in workspace settings.';
    }
    return null;
  }

  if (window.end.toMillis() - window.start.toMillis() > 31 * 86_400_000) {
    return 'A date-time booking cannot exceed 31 days.';
  }
  const timeZone = typeof workspace.timezone === 'string' ? workspace.timezone : 'UTC';
  for (let cursor = window.start.toMillis(); cursor < window.end.toMillis(); cursor += 30 * 60_000) {
    const { weekday, hour } = localParts(new Date(cursor), timeZone);
    if (!workingDays.has(weekday)) return 'Selected time range includes non-working days in workspace settings.';
    if (blockedDays.has(weekday)) return 'Selected time range includes blocked days in workspace settings.';
    if (blockedHours.has(hour)) return 'Selected time range includes blocked hours in workspace settings.';
  }
  return null;
}

function overlaps(existing: DocumentData, input: CreateInput, window: Window, bufferMs: number): boolean {
  if (!activeStatuses.has(existing.status) || existing.deletedAt != null) return false;
  if (input.bookingMode === 'DATE_RANGE') {
    return Boolean(existing.startDate && existing.endDate)
      && existing.startDate < window.endDate!
      && existing.endDate > window.startDate!;
  }
  if (existing.startDate != null || !existing.start || !existing.end) return false;
  return existing.start.toMillis() < window.end.toMillis() + bufferMs
    && existing.end.toMillis() + bufferMs > window.start.toMillis();
}

function recipientIds(members: FirebaseFirestore.QueryDocumentSnapshot[]): string[] {
  return [...new Set(members
    .filter((member) => member.get('isActive') === true && ['OWNER', 'STAFF'].includes(member.get('role')))
    .map((member) => member.get('userId'))
    .filter((uid): uid is string => typeof uid === 'string'))].slice(0, 500);
}

export const createReservation = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Sign in to create a reservation.');
  if (REQUIRE_EMAIL_VERIFICATION && !request.auth?.token.email_verified) fail('failed-precondition', 'Verify your email before creating a reservation.', 'EMAIL_NOT_VERIFIED');

  const parsed = createSchema.safeParse(request.data);
  if (!parsed.success) fail('invalid-argument', 'Reservation details are invalid.');
  const input = parsed.data;
  const firstWindow = resolveWindow(input);
  if (firstWindow.start.toMillis() >= firstWindow.end.toMillis()) {
    fail('invalid-argument', 'Start time must be earlier than end time.');
  }
  if (input.bookingMode === 'DATE_RANGE' && (firstWindow.end.toMillis() - firstWindow.start.toMillis()) > 365 * 86_400_000) {
    fail('invalid-argument', 'A reservation cannot exceed 365 nights.');
  }
  if (input.recurrence && input.isPublicRequest) {
    fail('invalid-argument', 'Public booking requests cannot repeat.');
  }

  const workspaceRef = db.doc(`workspaces/${input.workspaceId}`);
  const resourceRef = workspaceRef.collection('resources').doc(input.resourceId);
  const memberRef = db.doc(`workspaceMembers/${uid}_${input.workspaceId}`);
  const lockRef = workspaceRef.collection('resourceLocks').doc(input.resourceId);
  const reservationsRef = workspaceRef.collection('reservations');
  const reservationRef = reservationsRef.doc();
  const idempotencyRef = input.idempotencyKey
    ? workspaceRef.collection('idempotency').doc(`${uid}_${input.idempotencyKey}`)
    : null;

  const result = await db.runTransaction(async (tx) => {
    if (idempotencyRef) {
      const previous = await tx.get(idempotencyRef);
      if (previous.exists) return previous.data() as {
        reservationId: string;
        seriesId?: string;
        createdCount: number;
        skippedCount: number;
      };
    }

    const lockSnapshot = await tx.get(lockRef);
    const [workspaceSnapshot, resourceSnapshot, memberSnapshot, reservationsSnapshot] = await Promise.all([
      tx.get(workspaceRef),
      tx.get(resourceRef),
      tx.get(memberRef),
      tx.get(reservationsRef.where('resourceId', '==', input.resourceId)),
    ]);

    if (!workspaceSnapshot.exists) fail('not-found', 'Workspace not found.');
    if (!resourceSnapshot.exists || resourceSnapshot.get('isActive') !== true) fail('not-found', 'Resource not found or inactive.');
    const workspace = workspaceSnapshot.data()!;
    const resource = resourceSnapshot.data()!;
    if (workspace.status !== 'ACTIVE') fail('failed-precondition', 'Workspace is not active.');
    if (!['APPROVED', 'NOT_REQUIRED', undefined].includes(workspace.accessApprovalStatus)) {
      fail('failed-precondition', 'Workspace access is not approved.');
    }
    if (resource.bookingMode !== input.bookingMode) fail('invalid-argument', 'Booking mode does not match the resource.');

    const isMember = memberSnapshot.exists && memberSnapshot.get('isActive') === true;
    const isManager = workspace.ownerId === uid
      || (isMember && memberSnapshot.get('role') === 'STAFF');
    const isPublicRequest = input.isPublicRequest === true && !isManager;
    if (!isManager && !isPublicRequest) fail('permission-denied', 'You cannot create reservations for this workspace.');
    if (isPublicRequest && workspace.workspaceSettings?.publicCalendarAccess !== 'BUSY_ONLY') {
      fail('permission-denied', 'Public booking is not enabled for this workspace.');
    }

    if (isPublicRequest && input.price) fail('invalid-argument', 'Public requests cannot set a price.');

    const resourceReservations = reservationsSnapshot.docs;
    const bufferMs = input.bookingMode === 'DATETIME_RANGE'
      ? Math.max(0, Number(resource.bufferMinutes ?? 0)) * 60_000
      : 0;

    const candidates = expandOccurrences(input, firstWindow, workspace.timezone ?? 'UTC');
    const bookable: Occurrence[] = [];
    let skippedCount = 0;
    for (const candidate of candidates) {
      if (candidate.start.toMillis() >= candidate.end.toMillis()) {
        fail('invalid-argument', 'A recurring booking has an invalid time range.');
      }
      const violation = workspaceRuleViolation(workspace, input.bookingMode, candidate);
      const conflictsWithExisting = resourceReservations.some((snapshot) =>
        overlaps(snapshot.data(), input, candidate, bufferMs),
      );
      const conflictsWithSeries = bookable.some((existing) =>
        overlaps({ ...existing, status: 'CONFIRMED', deletedAt: null }, input, candidate, bufferMs),
      );
      if (violation || conflictsWithExisting || conflictsWithSeries) {
        if (input.recurrence && input.skipConflictingOccurrences) {
          skippedCount++;
          continue;
        }
        fail(
          violation ? 'failed-precondition' : 'already-exists',
          violation ?? 'One or more dates in this series are already booked.',
          violation ? 'OUTSIDE_AVAILABILITY' : 'RESERVATION_CONFLICT',
        );
      }
      bookable.push(candidate);
    }
    if (!bookable.length) fail('already-exists', 'None of the dates in this series are available.');

    const membersSnapshot = isPublicRequest
      ? await tx.get(db.collection('workspaceMembers').where('workspaceId', '==', input.workspaceId))
      : null;
    const price = input.price;
    const basePrice = Number(resource.basePrice ?? 0);
    tx.set(lockRef, { revision: Number(lockSnapshot.get('revision') ?? 0) + 1, updatedAt: FieldValue.serverTimestamp() });
    const seriesId = input.recurrence ? workspaceRef.collection('reservationSeries').doc().id : undefined;
    bookable.forEach((occurrence, position) => {
      const occurrenceRef = position === 0 ? reservationRef : reservationsRef.doc();
      const quantity = input.bookingMode === 'DATE_RANGE'
        ? (occurrence.end.toMillis() - occurrence.start.toMillis()) / 86_400_000
        : Math.max(1, (occurrence.end.toMillis() - occurrence.start.toMillis()) / 3_600_000);
      const amount = isPublicRequest ? basePrice * quantity : (price?.amount ?? basePrice * quantity);
      const paymentApplies = position === 0;
      const status = isPublicRequest ? 'PENDING' : 'CONFIRMED';
      const reservationData = {
        reservationId: occurrenceRef.id,
        ...(isPublicRequest ? { requesterUid: uid } : {}),
        ...(seriesId ? {
          seriesId,
          occurrenceIndex: occurrence.index,
          occurrenceCount: bookable.length,
          recurrence: input.recurrence,
        } : {}),
        resourceId: input.resourceId,
        resourceName: resource.name,
        resourceType: resource.type,
        start: occurrence.start,
        end: occurrence.end,
        startDate: occurrence.startDate,
        endDate: occurrence.endDate,
        status,
        paymentStatus: isPublicRequest || !paymentApplies ? 'UNPAID' : (input.paymentStatus ?? 'UNPAID'),
        paymentMethod: paymentApplies && !isPublicRequest && input.paymentStatus === 'PAID'
          ? (input.paymentMethod ?? 'Cash')
          : null,
        customer: {
          name: input.customer.name,
          phone: input.customer.phone,
          email: input.customer.email ?? null,
          notes: input.customer.notes ?? null,
        },
        price: {
          amount,
          currency: workspace.currency,
          unit: resource.priceUnit,
          quantity,
          basePrice,
        },
        deposit: paymentApplies && !isPublicRequest ? (input.deposit ?? null) : null,
        notes: input.notes ?? null,
        attachmentUrls: [],
        createdBy: isPublicRequest ? 'PUBLIC' : uid,
        updatedBy: isPublicRequest ? 'PUBLIC' : uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        cancelledBy: null,
        cancelledAt: null,
        cancellationReason: null,
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
      };

      tx.create(occurrenceRef, reservationData);
      if (!isPublicRequest) {
        tx.set(workspaceRef.collection('publicBusySlots').doc(occurrenceRef.id), {
          reservationId: occurrenceRef.id,
          resourceId: input.resourceId,
          resourceName: resource.name,
          start: occurrence.start,
          end: occurrence.end,
          startDate: occurrence.startDate,
          endDate: occurrence.endDate,
          status: 'CONFIRMED',
        });
      }
      tx.create(occurrenceRef.collection('auditLog').doc(), {
        action: 'CREATED',
        performedBy: uid,
        performedAt: FieldValue.serverTimestamp(),
        changes: { status },
      });
    });

    const response = {
      reservationId: reservationRef.id,
      ...(seriesId ? { seriesId } : {}),
      createdCount: bookable.length,
      skippedCount,
    };
    if (idempotencyRef) tx.create(idempotencyRef, { ...response, createdAt: FieldValue.serverTimestamp() });
    if (isPublicRequest && membersSnapshot) {
      const recipients = recipientIds(membersSnapshot.docs);
      const notificationRef = workspaceRef.collection('notificationOutbox').doc(randomUUID());
      tx.create(notificationRef, {
        type: 'RESERVATION_REQUESTED',
        workspaceId: input.workspaceId,
        reservationId: reservationRef.id,
        recipientUids: recipients,
        createdAt: FieldValue.serverTimestamp(),
        deliveryStatus: 'PENDING',
      });
    }

    return response;
  });
  return { success: true, data: result, timestamp: new Date().toISOString() };
});

export const updateReservationStatus = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Sign in to update a reservation.');
  if (REQUIRE_EMAIL_VERIFICATION && !request.auth?.token.email_verified) fail('failed-precondition', 'Verify your email before updating a reservation.', 'EMAIL_NOT_VERIFIED');
  const parsed = statusSchema.safeParse(request.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail('invalid-argument', 'Status update is invalid.', 'VALIDATION_ERROR', {
      field: issue.path.join('.') || 'request',
      issue: issue.code,
    });
  }
  const input = parsed.data;
  const workspaceRef = db.doc(`workspaces/${input.workspaceId}`);
  const reservationRef = workspaceRef.collection('reservations').doc(input.reservationId);
  const memberRef = db.doc(`workspaceMembers/${uid}_${input.workspaceId}`);

  const updatedCount = await db.runTransaction(async (tx) => {
    const [workspaceSnapshot, memberSnapshot, reservationSnapshot] = await Promise.all([
      tx.get(workspaceRef),
      tx.get(memberRef),
      tx.get(reservationRef),
    ]);
    if (!workspaceSnapshot.exists || !reservationSnapshot.exists) fail('not-found', 'Reservation not found.');
    const workspace = workspaceSnapshot.data()!;
    const isManager = workspace.ownerId === uid
      || (memberSnapshot.exists && memberSnapshot.get('isActive') === true && memberSnapshot.get('role') === 'STAFF');
    if (!isManager) fail('permission-denied', 'You cannot update reservations for this workspace.');

    const reservation = reservationSnapshot.data()!;
    const scope = input.scope ?? 'THIS';
    if (scope === 'SERIES' && (input.status !== 'CANCELLED' || !reservation.seriesId)) {
      fail('invalid-argument', 'Series scope is only supported for cancelling a recurring reservation.');
    }

    const seriesSnapshot = scope === 'SERIES'
      ? await tx.get(workspaceRef.collection('reservations').where('seriesId', '==', reservation.seriesId))
      : null;
    const nowMillis = Date.now();
    const targets = seriesSnapshot
      ? seriesSnapshot.docs
          .filter((snapshot) => {
            const member = snapshot.data();
            return !member.deletedAt
              && (activeStatuses.has(member.status) || snapshot.id === input.reservationId)
              && (snapshot.id === input.reservationId || member.end?.toMillis?.() > nowMillis);
          })
          .map((snapshot) => ({ ref: snapshot.ref, data: snapshot.data() }))
      : [{ ref: reservationRef, data: reservation }];

    for (const target of targets) {
      const allowed = validTransitions[target.data.status] ?? [];
      if (!allowed.includes(input.status)) fail('failed-precondition', 'This status transition is not allowed.');
    }

    for (const target of targets) {
      const targetId = target.ref.id;
      const targetReservation = target.data;
      const now = FieldValue.serverTimestamp();
      const fields: Record<string, unknown> = { status: input.status, updatedBy: uid, updatedAt: now };
      if (input.status === 'CANCELLED') {
        fields.cancelledBy = uid;
        fields.cancelledAt = now;
        fields.cancellationReason = input.reason ?? null;
      }
      if (input.status === 'DELETED') {
        fields.deletedBy = uid;
        fields.deletedAt = now;
        fields.deletionReason = input.reason ?? null;
      }
      tx.update(target.ref, fields);

      const busyRef = workspaceRef.collection('publicBusySlots').doc(targetId);
      if (input.status === 'CONFIRMED') {
        tx.set(busyRef, {
          reservationId: targetId,
          resourceId: targetReservation.resourceId,
          resourceName: targetReservation.resourceName ?? '',
          start: targetReservation.start,
          end: targetReservation.end,
          startDate: targetReservation.startDate ?? null,
          endDate: targetReservation.endDate ?? null,
          status: 'CONFIRMED',
        });
      } else if (!activeStatuses.has(input.status)) {
        tx.delete(busyRef);
      }

      tx.create(target.ref.collection('auditLog').doc(), {
        action: input.status,
        performedBy: uid,
        performedAt: now,
        reason: input.reason ?? null,
        changes: { status: { from: targetReservation.status, to: input.status } },
      });

      if (targetReservation.requesterUid && ['CONFIRMED', 'CANCELLED'].includes(input.status)) {
        const notificationType = input.status === 'CONFIRMED'
          ? 'RESERVATION_CONFIRMED'
          : targetReservation.status === 'PENDING'
            ? 'RESERVATION_DECLINED'
            : 'RESERVATION_CANCELLED';
        tx.create(workspaceRef.collection('notificationOutbox').doc(randomUUID()), {
          type: notificationType,
          workspaceId: input.workspaceId,
          reservationId: targetId,
          recipientUids: [targetReservation.requesterUid],
          createdAt: now,
          deliveryStatus: 'PENDING',
        });
      }
    }
    return targets.length;
  });

  return { success: true, data: { updatedCount }, timestamp: new Date().toISOString() };
});

export const updateReservationPayment = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) fail('unauthenticated', 'Sign in to update payment status.');
  if (REQUIRE_EMAIL_VERIFICATION && !request.auth?.token.email_verified) fail('failed-precondition', 'Verify your email before updating payment status.', 'EMAIL_NOT_VERIFIED');
  const parsed = paymentSchema.safeParse(request.data);
  if (!parsed.success) fail('invalid-argument', 'Payment update is invalid.');
  const input = parsed.data;
  const workspaceRef = db.doc(`workspaces/${input.workspaceId}`);
  const memberRef = db.doc(`workspaceMembers/${uid}_${input.workspaceId}`);
  const reservationRef = workspaceRef.collection('reservations').doc(input.reservationId);

  await db.runTransaction(async (tx) => {
    const [workspaceSnapshot, memberSnapshot, reservationSnapshot] = await Promise.all([
      tx.get(workspaceRef),
      tx.get(memberRef),
      tx.get(reservationRef),
    ]);
    if (!workspaceSnapshot.exists || !reservationSnapshot.exists) fail('not-found', 'Reservation not found.');
    const workspace = workspaceSnapshot.data()!;
    const isManager = workspace.ownerId === uid
      || (memberSnapshot.exists && memberSnapshot.get('isActive') === true && memberSnapshot.get('role') === 'STAFF');
    if (!isManager) fail('permission-denied', 'You cannot update payments for this workspace.');

    const allowedMethods = Array.isArray(workspace.paymentMethods) ? workspace.paymentMethods : [];
    const paymentMethod = input.paymentStatus === 'PAID'
      ? (input.paymentMethod ?? 'Cash')
      : null;
    if (paymentMethod && !allowedMethods.includes(paymentMethod) && paymentMethod !== 'Cash') {
      fail('invalid-argument', 'Payment method is not enabled for this workspace.');
    }

    const now = FieldValue.serverTimestamp();
    tx.update(reservationRef, {
      paymentStatus: input.paymentStatus,
      paymentMethod,
      updatedBy: uid,
      updatedAt: now,
    });
    tx.create(reservationRef.collection('auditLog').doc(), {
      action: 'PAYMENT_UPDATED',
      performedBy: uid,
      performedAt: now,
      changes: { paymentStatus: input.paymentStatus, paymentMethod },
    });
  });

  return { success: true, data: null, timestamp: new Date().toISOString() };
});

export const deliverReservationNotification = onDocumentCreated(
  'workspaces/{workspaceId}/notificationOutbox/{notificationId}',
  async (event) => {
    const notification = event.data?.data();
    if (!event.data || !notification) return;

    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      logger.info('Notification queued in emulator; FCM delivery is intentionally disabled.', {
        notificationId: event.params.notificationId,
      });
      await event.data.ref.update({ deliveryStatus: 'EMULATOR_SKIPPED' });
      return;
    }

    const recipientUids = Array.isArray(notification.recipientUids)
      ? notification.recipientUids.filter((uid): uid is string => typeof uid === 'string').slice(0, 500)
      : [];
    const tokenSnapshots = await Promise.all(
      recipientUids.map((uid) => db.doc(`users/${uid}/private/push`).get()),
    );
    const tokens = tokenSnapshots
      .map((snapshot) => snapshot.get('fcmToken'))
      .filter((token): token is string => typeof token === 'string' && token.length > 0);

    if (!tokens.length) {
      await event.data.ref.update({ deliveryStatus: 'NO_TOKENS', deliveredAt: FieldValue.serverTimestamp() });
      return;
    }

    try {
      const result = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: notificationTitle(notification.type),
          body: notificationBody(notification.type),
        },
        data: {
          workspaceId: String(notification.workspaceId),
          reservationId: String(notification.reservationId),
          type: String(notification.type),
          link: notification.type === 'RESERVATION_REQUESTED'
            ? `/reservations/${String(notification.reservationId)}`
            : '/my-reservations',
        },
      });
      await event.data.ref.update({
        deliveryStatus: result.failureCount ? 'PARTIAL' : 'SENT',
        deliveredAt: FieldValue.serverTimestamp(),
        successCount: result.successCount,
        failureCount: result.failureCount,
      });
    } catch (error) {
      logger.error('Reservation notification delivery failed.', error);
      await event.data.ref.update({ deliveryStatus: 'FAILED', lastError: 'FCM delivery failed.' });
      throw error;
    }
  },
);

function notificationTitle(type: unknown): string {
  switch (type) {
    case 'RESERVATION_REQUESTED': return 'New reservation request';
    case 'RESERVATION_CONFIRMED': return 'Reservation confirmed';
    case 'RESERVATION_DECLINED': return 'Reservation declined';
    case 'RESERVATION_CANCELLED': return 'Reservation cancelled';
    default: return 'StayManager update';
  }
}

function notificationBody(type: unknown): string {
  switch (type) {
    case 'RESERVATION_REQUESTED': return 'A guest submitted a reservation request.';
    case 'RESERVATION_CONFIRMED': return 'Your reservation has been confirmed.';
    case 'RESERVATION_DECLINED': return 'Your reservation request was declined.';
    case 'RESERVATION_CANCELLED': return 'Your reservation has been cancelled.';
    default: return 'There is an update to your reservation.';
  }
}
