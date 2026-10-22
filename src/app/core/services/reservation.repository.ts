import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionGroup,
  collectionData,
  getDocs,
  getDoc,
  doc,
  docData,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  DocumentSnapshot,
  writeBatch,
} from '@angular/fire/firestore';
import { combineLatest, Observable, of, throwError, timer } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { Reservation } from '../models/reservation.model';
import { BookingMode, PaymentStatus, ReservationStatus } from '../models/enums';
import { RecurrenceRule, SeriesScope } from '../models/recurrence.model';
import { StorageService } from './storage.service';
import { AuthService } from '../../services/auth.service';
import { WorkspaceService } from './workspace.service';
import { CloudFunctionService } from './cloud-function.service';
import {
  CreateReservationDto,
  CreateDateRangeReservationDto,
  CreateReservationResponseData,
  UpdatableReservationStatus,
  ReservationFilters,
  BookingWindowDto,
  SeriesOccurrencePreview,
  SeriesPreviewRequest,
  UpdateReservationDetailsDto,
} from '../dtos/reservation.dto';
import {
  CloudFunctionErrorCode,
  CloudFunctionErrorResponse,
  CloudFunctionResult,
} from '../dtos/cloud-function.dto';
import { Workspace } from '../models/workspace.model';
import {
  expandRecurrence,
  getRecurrenceRuleError,
  normalizeRecurrenceRule,
  selectSeriesTargets,
} from '../utils/recurrence';

export interface PublicBusySlot {
  reservationId: string;
  resourceId: string;
  resourceName: string;
  start: Timestamp;
  end: Timestamp;
  startDate: string | null;
  endDate: string | null;
  status: ReservationStatus;
}

const PAGE_SIZE = 25;

interface ResolvedWindow {
  start: Timestamp;
  end: Timestamp;
  startDate: string | null;
  endDate: string | null;
}

interface ReservationDataArgs {
  id: string;
  dto: CreateReservationDto;
  window: ResolvedWindow;
  userId?: string;
  isPublicRequest: boolean;
  /** False for later bookings of a series: payment status, method and deposit stay on the first one. */
  carriesPayment: boolean;
  series?: { seriesId: string; index: number; count: number; recurrence: RecurrenceRule };
}

@Injectable({ providedIn: 'root' })
export class ReservationRepository {
  private firestore        = inject(Firestore);
  private storage          = inject(StorageService);
  private auth             = inject(AuthService);
  private workspaceService = inject(WorkspaceService);
  private cloudFunctions   = inject(CloudFunctionService);

  // ── Reads ───────────────────────────────────────────────────────────────────

  get(workspaceId: string, reservationId: string): Observable<Reservation | undefined> {
    return docData<Reservation>(
      doc(this.firestore, this.docPath(workspaceId, reservationId)) as any,
      { idField: 'reservationId' },
    );
  }

  listForCustomer(
    userId: string,
    email: string | null,
    emailVerified: boolean,
  ): Observable<Reservation[]> {
    const reservations = collectionGroup(this.firestore, 'reservations');
    // Right after login the Firestore SDK can still hold the old token; a new listener picks up the fresh one.
    const retryWhileTokenSettles = retry<Reservation[]>({
      count: 3,
      delay: (error, attempt) =>
        (error as { code?: string })?.code === 'permission-denied'
          ? timer(400 * attempt)
          : throwError(() => error),
    });
    const ownedQuery = query(reservations, where('requesterUid', '==', userId));
    const owned$ = collectionData<Reservation>(ownedQuery as any, { idField: 'reservationId' }).pipe(
      retryWhileTokenSettles,
    );
    const legacy$ = email && emailVerified
      ? collectionData<Reservation>(
          query(
            reservations,
            where('customer.email', '==', email),
          ) as any,
          { idField: 'reservationId' },
        ).pipe(
          retryWhileTokenSettles,
          // Best-effort: a failed email lookup must not discard UID-linked results.
          catchError((error) => {
            console.warn('Legacy email reservation lookup failed.', error);
            return of([] as Reservation[]);
          }),
        )
      : of([] as Reservation[]);

    return combineLatest([owned$, legacy$]).pipe(
      map(([owned, legacy]) => {
        const unique = new Map<string, Reservation>();
        for (const reservation of [...owned, ...legacy]) {
          if (!reservation.deletedAt && reservation.status !== ReservationStatus.DELETED) {
            unique.set(reservation.reservationId, reservation);
          }
        }
        return [...unique.values()].sort(
          (left, right) => right.createdAt.toMillis() - left.createdAt.toMillis(),
        );
      }),
    );
  }

  list(
    workspaceId: string,
    filters: ReservationFilters = {},
    includeDeleted = false,
  ): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    const constraints: QueryConstraint[] = [];

    if (!includeDeleted) {
      constraints.push(where('deletedAt', '==', null));
    }
    if (filters.resourceId) {
      constraints.push(where('resourceId', '==', filters.resourceId));
    }
    if (filters.status?.length) {
      constraints.push(where('status', 'in', filters.status));
    }
    if (filters.fromDate) {
      constraints.push(where('startDate', '>=', filters.fromDate));
    }
    constraints.push(orderBy('start', 'desc'));

    return collectionData<Reservation>(
      query(col, ...constraints) as any,
      { idField: 'reservationId' },
    );
  }

  listPending(workspaceId: string): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<Reservation>(
      query(col, where('status', '==', ReservationStatus.PENDING)) as any,
      { idField: 'reservationId' },
    ).pipe(
      map((reservations) =>
        reservations
          .filter((reservation) => reservation.deletedAt == null)
          .sort((a, b) => b.start.toMillis() - a.start.toMillis()),
      ),
    );
  }

  listPaged(
    workspaceId: string,
    filters: ReservationFilters = {},
    cursor?: DocumentSnapshot,
  ): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    const constraints: QueryConstraint[] = [
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];
    if (cursor) constraints.push(startAfter(cursor));
    return collectionData<Reservation>(query(col, ...constraints) as any, {
      idField: 'reservationId',
    });
  }

  listForDateWindow(
    workspaceId: string,
    windowStart: string,
    windowEnd: string,
    resourceId?: string,
  ): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    const constraints: QueryConstraint[] = [
      where('deletedAt', '==', null),
      where('startDate', '<=', windowEnd),
      orderBy('startDate', 'asc'),
    ];
    if (resourceId) constraints.push(where('resourceId', '==', resourceId));
    return collectionData<Reservation>(query(col, ...constraints) as any, {
      idField: 'reservationId',
    });
  }

  /**
   * Calendar month query for DATETIME_RANGE resources (Football Field, Meeting Room, etc.).
   * Fetches reservations whose start Timestamp falls within the given ms window.
   * windowStartMs and windowEndMs are milliseconds since epoch.
   */
  listForDateTimeWindow(
    workspaceId: string,
    windowStartMs: number,
    windowEndMs: number,
    resourceId?: string,
  ): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    const constraints: QueryConstraint[] = [
      where('deletedAt', '==', null),
      where('startDate', '==', null),   // only DATETIME_RANGE docs
      where('start', '>=', Timestamp.fromMillis(windowStartMs)),
      where('start', '<=', Timestamp.fromMillis(windowEndMs)),
      orderBy('start', 'asc'),
    ];
    if (resourceId) constraints.push(where('resourceId', '==', resourceId));
    return collectionData<Reservation>(query(col, ...constraints) as any, {
      idField: 'reservationId',
    });
  }

  listUpcoming(workspaceId: string, fromDate: string, maxItems = 10): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<Reservation>(
      query(
        col,
        where('deletedAt', '==', null),
        where('status', 'in', [ReservationStatus.PENDING, ReservationStatus.CONFIRMED]),
        where('startDate', '>=', fromDate),
        orderBy('startDate', 'asc'),
        orderBy('start', 'asc'),
        limit(maxItems),
      ) as any,
      { idField: 'reservationId' },
    );
  }

  listPublicBusySlotsForDateWindow(
    workspaceId: string,
    windowStart: string,
    windowEnd: string,
    resourceId?: string,
  ): Observable<PublicBusySlot[]> {
    const col = collection(this.firestore, this.publicBusyColPath(workspaceId));
    return collectionData<PublicBusySlot>(col as any, { idField: 'reservationId' }).pipe(
      map((slots: PublicBusySlot[]) =>
        slots
          .filter((slot) => !resourceId || slot.resourceId === resourceId)
          .filter((slot) => {
            if (slot.startDate && slot.endDate) {
              // DATE_RANGE values are [startDate, endDate) while windowEnd is inclusive.
              // Convert to [windowStart, windowEndExclusive) to keep month-end nights visible.
              const windowEndExclusive = this.toDateOnly(this.addDays(this.parseDateOnly(windowEnd), 1));
              return slot.startDate < windowEndExclusive && slot.endDate > windowStart;
            }

            const start = slot.start?.toDate?.();
            const end = slot.end?.toDate?.();
            if (!start || !end) return false;
            const dayStart = new Date(windowStart + 'T00:00:00').getTime();
            const dayEnd = new Date(windowEnd + 'T23:59:59').getTime();
            return start.getTime() < dayEnd && end.getTime() > dayStart;
          })
          .sort((a, b) => a.start.toMillis() - b.start.toMillis()),
      ),
    );
  }

  listPublicBusySlotsForDateTimeWindow(
    workspaceId: string,
    windowStartMs: number,
    windowEndMs: number,
    resourceId?: string,
  ): Observable<PublicBusySlot[]> {
    const col = collection(this.firestore, this.publicBusyColPath(workspaceId));
    return collectionData<PublicBusySlot>(col as any, { idField: 'reservationId' }).pipe(
      map((slots: PublicBusySlot[]) =>
        slots
          .filter((slot) => !resourceId || slot.resourceId === resourceId)
          .filter((slot) => {
            if (slot.startDate !== null) return false;
            const startMs = slot.start?.toMillis?.();
            const endMs = slot.end?.toMillis?.();
            if (startMs === undefined || endMs === undefined) return false;
            return startMs < windowEndMs && endMs > windowStartMs;
          })
          .sort((a, b) => a.start.toMillis() - b.start.toMillis()),
      ),
    );
  }

  /**
   * Rebuild public busy-slot projection from confirmed, non-deleted reservations.
   * Useful for backfilling reservations created before projection support.
   */
  async republishPublicBusySlots(workspaceId: string): Promise<number> {
    const reservationsSnap = await getDocs(collection(this.firestore, this.colPath(workspaceId)) as any);
    const publicSnap = await getDocs(collection(this.firestore, this.publicBusyColPath(workspaceId)) as any);

    // Clear stale projection docs first.
    await Promise.all(publicSnap.docs.map((d) => deleteDoc(d.ref)));

    const confirmed = reservationsSnap.docs
      .map((d) => d.data() as Reservation)
      .filter((r) => r.status === ReservationStatus.CONFIRMED && !r.deletedAt);

    await Promise.all(
      confirmed.map((reservation) =>
        setDoc(doc(this.firestore, this.publicBusyDocPath(workspaceId, reservation.reservationId)), {
          reservationId: reservation.reservationId,
          resourceId: reservation.resourceId,
          resourceName: reservation.resourceName,
          start: reservation.start,
          end: reservation.end,
          startDate: reservation.startDate,
          endDate: reservation.endDate,
          status: reservation.status,
        }),
      ),
    );

    return confirmed.length;
  }

  auditLog(workspaceId: string, reservationId: string) {
    const col = collection(
      this.firestore,
      `${this.docPath(workspaceId, reservationId)}/auditLog`,
    );
    return collectionData(query(col, orderBy('performedAt', 'asc')) as any, {
      idField: 'logId',
    });
  }

  // ── Writes (direct Firestore) ────────────────────────────────────────────────

  /** Create a new reservation directly in Firestore. */
  async create(
    dto: CreateReservationDto,
  ): Promise<CloudFunctionResult<CreateReservationResponseData>> {
    return this.cloudFunctions.call<CreateReservationResponseData, CreateReservationDto>(
      'createReservation',
      { ...dto, idempotencyKey: dto.idempotencyKey ?? crypto.randomUUID() },
    );
  }

  // ── Recurring bookings ───────────────────────────────────────────────────────

  /**
   * Expands the recurrence rule and reports, per date, whether it can be booked.
   * Uses the client workspace settings; createSeries re-validates against the stored ones.
   */
  async previewSeries(request: SeriesPreviewRequest): Promise<SeriesOccurrencePreview[]> {
    if (getRecurrenceRuleError(request.recurrence)) return [];
    const active = await this.loadActiveReservations(request.workspaceId, request.resourceId);
    return this.evaluateSeries(request, this.workspaceService.workspaceSettings(), active);
  }

  /**
   * Cancels a reservation, or every upcoming active booking of its series.
   */
  async cancelWithScope(
    workspaceId: string,
    reservation: Reservation,
    scope: SeriesScope,
    reason?: string,
  ): Promise<CloudFunctionResult> {
    return this.cloudFunctions.call<void, {
      workspaceId: string;
      reservationId: string;
      status: ReservationStatus.CANCELLED;
      reason?: string;
      scope: SeriesScope;
    }>('updateReservationStatus', {
      workspaceId,
      reservationId: reservation.reservationId,
      status: ReservationStatus.CANCELLED,
      reason,
      scope,
    });
  }

  /**
   * Edits guest details, notes and price of a reservation, or of every upcoming active
   * booking of its series. Dates and resource are not editable here.
   */
  async updateDetails(
    workspaceId: string,
    reservation: Reservation,
    changes: UpdateReservationDetailsDto,
    scope: SeriesScope,
  ): Promise<CloudFunctionResult> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      if (!Number.isFinite(changes.priceAmount) || changes.priceAmount < 0) {
        return this.failure(CloudFunctionErrorCode.VALIDATION_ERROR, 'Amount must be 0 or more.');
      }

      const targets = await this.resolveScope(workspaceId, reservation, scope);
      const batch = writeBatch(this.firestore);
      for (const target of targets) {
        batch.update(doc(this.firestore, this.docPath(workspaceId, target.reservationId)), {
          'customer.name': changes.customer.name,
          'customer.phone': changes.customer.phone,
          'customer.email': changes.customer.email,
          notes: changes.notes,
          'price.amount': changes.priceAmount,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      return { success: true, data: undefined as never, timestamp: new Date().toISOString() };
    } catch (err: any) {
      return this.failure(CloudFunctionErrorCode.INTERNAL_ERROR, err?.message ?? 'Failed to update.');
    }
  }

  /** All bookings of a series, live, ordered by start. */
  listSeries(workspaceId: string, seriesId: string): Observable<Reservation[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<Reservation>(query(col, where('seriesId', '==', seriesId)) as any, {
      idField: 'reservationId',
    }).pipe(map((members) => members.sort((a, b) => a.start.toMillis() - b.start.toMillis())));
  }

  private async createSeries(
    dto: CreateReservationDto,
    rule: RecurrenceRule,
    userId: string,
  ): Promise<CloudFunctionResult<CreateReservationResponseData>> {
    if (getRecurrenceRuleError(rule)) {
      return this.failure(CloudFunctionErrorCode.VALIDATION_ERROR, 'Recurrence settings are invalid.');
    }

    const workspace = await this.getWorkspace(dto.workspaceId);
    if (!workspace) {
      return this.failure(CloudFunctionErrorCode.WORKSPACE_NOT_FOUND, 'Workspace not found.');
    }

    const first = this.resolveWindow(dto);
    if (first.start.toMillis() >= first.end.toMillis()) {
      return this.failure(CloudFunctionErrorCode.VALIDATION_ERROR, 'Start time must be earlier than end time.');
    }

    const recurrence = normalizeRecurrenceRule(rule);
    const active = await this.loadActiveReservations(dto.workspaceId, dto.resourceId);
    const settings = workspace.workspaceSettings ?? this.workspaceService.workspaceSettings();
    const occurrences = this.evaluateSeries({ ...dto, recurrence }, settings, active);

    const bookable = occurrences.filter((occurrence) => occurrence.status === 'OK');
    const skippedCount = occurrences.length - bookable.length;
    if (bookable.length === 0) {
      return this.failure(CloudFunctionErrorCode.RESERVATION_CONFLICT, 'None of the dates in this series are available.');
    }
    if (skippedCount > 0 && !dto.skipConflictingOccurrences) {
      return this.failure(
        CloudFunctionErrorCode.RESERVATION_CONFLICT,
        `${skippedCount} of ${occurrences.length} dates in this series are unavailable.`,
      );
    }

    const col = collection(this.firestore, this.colPath(dto.workspaceId));
    const seriesId = doc(col).id;
    const batch = writeBatch(this.firestore);
    const created: string[] = [];

    bookable.forEach((occurrence, position) => {
      const ref = doc(col);
      const window = this.windowOf(occurrence);
      created.push(ref.id);

      batch.set(
        ref,
        this.buildReservationData({
          id: ref.id,
          dto,
          window,
          userId,
          isPublicRequest: false,
          carriesPayment: position === 0,
          series: { seriesId, index: position + 1, count: bookable.length, recurrence },
        }),
      );
      batch.set(doc(this.firestore, this.publicBusyDocPath(dto.workspaceId, ref.id)), {
        reservationId: ref.id,
        resourceId: dto.resourceId,
        resourceName: dto.resourceName ?? '',
        start: window.start,
        end: window.end,
        startDate: window.startDate,
        endDate: window.endDate,
        status: ReservationStatus.CONFIRMED,
      });
    });
    await batch.commit();

    return {
      success: true,
      data: { reservationId: created[0], seriesId, createdCount: created.length, skippedCount },
      timestamp: new Date().toISOString(),
    };
  }

  private evaluateSeries(
    request: SeriesPreviewRequest,
    settings: Workspace['workspaceSettings'],
    active: Reservation[],
  ): SeriesOccurrencePreview[] {
    const first = this.resolveWindow(request);
    const isDateRange = request.bookingMode === BookingMode.DATE_RANGE;
    const occurrences = expandRecurrence(request.recurrence, {
      start: first.start.toDate(),
      end: first.end.toDate(),
    });

    let latestEndMs = Number.NEGATIVE_INFINITY;
    return occurrences.map((occurrence) => {
      const preview: SeriesOccurrencePreview = {
        index: occurrence.index,
        start: occurrence.start,
        end: occurrence.end,
        startDate: isDateRange ? this.toDateOnly(occurrence.start) : null,
        endDate: isDateRange ? this.toDateOnly(occurrence.end) : null,
        status: 'OK',
      };
      const window = this.windowOf(preview);

      const violation = this.getWorkspaceRuleViolation(
        settings,
        request.bookingMode,
        window.start,
        window.end,
        window.startDate,
        window.endDate,
      );
      if (violation) {
        preview.status = 'BLOCKED';
        preview.reason = violation.message;
      } else if (
        window.start.toMillis() < latestEndMs ||
        this.overlapsExisting(active, request.bookingMode, window)
      ) {
        preview.status = 'CONFLICT';
      }

      latestEndMs = Math.max(latestEndMs, window.end.toMillis());
      return preview;
    });
  }

  private async resolveScope(
    workspaceId: string,
    reservation: Reservation,
    scope: SeriesScope,
  ): Promise<Reservation[]> {
    if (scope === 'THIS' || !reservation.seriesId) return [reservation];

    const snap = await getDocs(
      query(
        collection(this.firestore, this.colPath(workspaceId)),
        where('seriesId', '==', reservation.seriesId),
      ),
    );
    const members = snap.docs.map((d) => ({ ...(d.data() as Reservation), reservationId: d.id }));
    return selectSeriesTargets(members, reservation.reservationId, Date.now());
  }

  /** Update reservation status directly in Firestore. */
  async updateStatus(
    workspaceId: string,
    reservationId: string,
    status: UpdatableReservationStatus,
    reason?: string,
  ): Promise<CloudFunctionResult> {
    return this.cloudFunctions.call<void, {
      workspaceId: string;
      reservationId: string;
      status: UpdatableReservationStatus;
      reason?: string;
    }>('updateReservationStatus', {
      workspaceId,
      reservationId,
      status,
      ...(reason !== undefined ? { reason } : {}),
    });
  }

  confirm(workspaceId: string, reservationId: string): Promise<CloudFunctionResult> {
    return this.updateStatus(workspaceId, reservationId, ReservationStatus.CONFIRMED);
  }

  complete(workspaceId: string, reservationId: string): Promise<CloudFunctionResult> {
    return this.updateStatus(workspaceId, reservationId, ReservationStatus.COMPLETED);
  }

  cancel(workspaceId: string, reservationId: string, reason?: string): Promise<CloudFunctionResult> {
    return this.updateStatus(workspaceId, reservationId, ReservationStatus.CANCELLED, reason);
  }

  delete(workspaceId: string, reservationId: string, reason?: string): Promise<CloudFunctionResult> {
    return this.updateStatus(workspaceId, reservationId, ReservationStatus.DELETED, reason);
  }

  async updatePaymentStatus(
    workspaceId: string,
    reservationId: string,
    paymentStatus: PaymentStatus,
  ): Promise<CloudFunctionResult> {
    return this.cloudFunctions.call<void, {
      workspaceId: string;
      reservationId: string;
      paymentStatus: PaymentStatus;
      paymentMethod?: string;
    }>('updateReservationPayment', {
      workspaceId,
      reservationId,
      paymentStatus,
      ...(paymentStatus === PaymentStatus.PAID ? { paymentMethod: 'Cash' } : {}),
    });
  }

  /** Update staff notes directly in Firestore. */
  async updateNotes(
    workspaceId: string,
    reservationId: string,
    notes: string,
  ): Promise<CloudFunctionResult> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const ref = doc(this.firestore, this.docPath(workspaceId, reservationId));
      await updateDoc(ref, { notes, updatedBy: user.uid, updatedAt: serverTimestamp() });
      return { success: true, data: undefined as never, timestamp: new Date().toISOString() };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to update notes.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ── Attachment workflow ──────────────────────────────────────────────────────

  prepareAttachmentUpload(workspaceId: string, reservationId: string, file: File) {
    const path = this.storage.reservationAttachmentPath(
      workspaceId,
      reservationId,
      `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    );
    return this.storage.upload(path, file);
  }

  async addAttachmentUrl(
    workspaceId: string,
    reservationId: string,
    attachmentUrl: string,
  ): Promise<CloudFunctionResult> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const ref = doc(this.firestore, this.docPath(workspaceId, reservationId));
      await updateDoc(ref, {
        attachmentUrls: arrayUnion(attachmentUrl),
        updatedBy:      user.uid,
        updatedAt:      serverTimestamp(),
      });
      return { success: true, data: undefined as never, timestamp: new Date().toISOString() };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to add attachment.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ── Search (command palette) ────────────────────────────────────────────────

  /**
   * Fetches the most recent non-deleted reservations and returns those whose
   * customer.name OR customer.phone contains the term (case-insensitive).
   *
   * Why client-side filtering instead of a Firestore range query:
   * - Firestore string range queries are case-sensitive — "ahmad" never matches "Ahmad".
   * - Nested-field range queries on customer.name are unreliable without a
   *   dedicated single-field index override.
   * - The (deletedAt, createdAt desc) composite index already exists, so this
   *   is a single cheap indexed read capped at SEARCH_LIMIT documents.
   */
  async search(workspaceId: string, term: string, maxItems = 8): Promise<Reservation[]> {
    const SEARCH_LIMIT = 200;
    const lc = term.toLowerCase();
    const col = collection(this.firestore, this.colPath(workspaceId));
    const snap = await getDocs(
      query(
        col,
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(SEARCH_LIMIT),
      ) as any,
    );

    return snap.docs
      .map((d) => ({ ...(d.data() as Reservation), reservationId: d.id }))
      .filter((r) =>
        r.customer.name.toLowerCase().includes(lc) ||
        r.customer.phone?.toLowerCase().includes(lc),
      )
      .slice(0, maxItems);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private failure(code: CloudFunctionErrorCode, message: string): CloudFunctionErrorResponse {
    return { success: false, code, message, timestamp: new Date().toISOString() };
  }

  private resolveWindow(dto: BookingWindowDto): ResolvedWindow {
    if (dto.bookingMode === BookingMode.DATE_RANGE) {
      return {
        start: Timestamp.fromDate(new Date(dto.startDate + 'T00:00:00')),
        end: Timestamp.fromDate(new Date(dto.endDate + 'T00:00:00')),
        startDate: dto.startDate,
        endDate: dto.endDate,
      };
    }
    return {
      start: Timestamp.fromDate(new Date(dto.start)),
      end: Timestamp.fromDate(new Date(dto.end)),
      startDate: null,
      endDate: null,
    };
  }

  private windowOf(occurrence: SeriesOccurrencePreview): ResolvedWindow {
    return {
      start: Timestamp.fromDate(occurrence.start),
      end: Timestamp.fromDate(occurrence.end),
      startDate: occurrence.startDate,
      endDate: occurrence.endDate,
    };
  }

  /** Loaded once and filtered in memory, which avoids a composite index on writes. */
  private async loadActiveReservations(workspaceId: string, resourceId: string): Promise<Reservation[]> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath(workspaceId)), where('resourceId', '==', resourceId)),
    );
    return snap.docs
      .map((d) => d.data() as Reservation)
      .filter(
        (r) =>
          !r.deletedAt &&
          (r.status === ReservationStatus.PENDING || r.status === ReservationStatus.CONFIRMED),
      );
  }

  private overlapsExisting(
    active: Reservation[],
    bookingMode: BookingMode,
    window: ResolvedWindow,
  ): boolean {
    const { startDate, endDate } = window;
    if (bookingMode === BookingMode.DATE_RANGE && startDate && endDate) {
      return active.some(
        (r) => Boolean(r.startDate && r.endDate) && r.startDate! < endDate && r.endDate! > startDate,
      );
    }

    const requestedStartMs = window.start.toMillis();
    const requestedEndMs = window.end.toMillis();
    return active.some((r) => {
      if (r.startDate !== null) return false;
      if (!r.start || !r.end) return false;
      return r.start.toMillis() < requestedEndMs && r.end.toMillis() > requestedStartMs;
    });
  }

  private conflictMessage(bookingMode: BookingMode): string {
    return bookingMode === BookingMode.DATE_RANGE
      ? 'This resource is already booked for the selected dates.'
      : 'This resource is already booked for the selected date and time.';
  }

  private buildReservationData(args: ReservationDataArgs): Record<string, unknown> {
    const { id, dto, window, userId, isPublicRequest, carriesPayment, series } = args;
    const actor = isPublicRequest ? 'PUBLIC' : (userId ?? 'PUBLIC');
    const paymentStatus = isPublicRequest || !carriesPayment
      ? PaymentStatus.UNPAID
      : (dto.paymentStatus ?? PaymentStatus.UNPAID);

    return {
      reservationId:      id,
      ...(isPublicRequest && userId ? { requesterUid: userId } : {}),
      resourceId:         dto.resourceId,
      resourceName:       dto.resourceName ?? '',
      resourceType:       dto.resourceType ?? null,
      start:              window.start,
      end:                window.end,
      startDate:          window.startDate,
      endDate:            window.endDate,
      status:             isPublicRequest ? ReservationStatus.PENDING : ReservationStatus.CONFIRMED,
      paymentStatus,
      paymentMethod:      carriesPayment && dto.paymentStatus === PaymentStatus.PAID
        ? dto.paymentMethod ?? 'Cash'
        : null,
      customer:           dto.customer,
      price:              dto.price ?? {
        amount:    0,
        currency:  this.workspaceService.currency(),
        unit:      dto.bookingMode === BookingMode.DATE_RANGE ? 'PER_NIGHT' : 'PER_HOUR',
        quantity:  1,
        basePrice: 0,
      },
      deposit:            carriesPayment ? (dto.deposit ?? null) : null,
      notes:              dto.notes ?? null,
      attachmentUrls:     [],
      ...(series
        ? {
            seriesId: series.seriesId,
            occurrenceIndex: series.index,
            occurrenceCount: series.count,
            recurrence: series.recurrence,
          }
        : {}),
      createdBy:          actor,
      updatedBy:          actor,
      createdAt:          serverTimestamp(),
      updatedAt:          serverTimestamp(),
      cancelledBy:        null,
      cancelledAt:        null,
      cancellationReason: null,
      deletedAt:          null,
      deletedBy:          null,
      deletionReason:     null,
    };
  }

  private colPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/reservations`;
  }

  private docPath(workspaceId: string, reservationId: string): string {
    return `workspaces/${workspaceId}/reservations/${reservationId}`;
  }

  private getWorkspaceRuleViolation(
    workspaceSettings: Workspace['workspaceSettings'] | undefined,
    bookingMode: BookingMode,
    start: Timestamp,
    end: Timestamp,
    startDate: string | null,
    endDate: string | null,
  ): { code: CloudFunctionErrorCode; message: string } | null {
    const settings = workspaceSettings ?? this.workspaceService.workspaceSettings();
    const rules = settings.operatingRules;
    const workingSet = new Set(rules.workingDays);
    const blockedDaySet = new Set(rules.blockedDays);
    const blockedHourSet = new Set(rules.blockedHours);

    if (bookingMode === BookingMode.DATE_RANGE && startDate && endDate) {
      const from = this.parseDateOnly(startDate);
      const to = this.parseDateOnly(endDate);

      // DATE_RANGE uses [startDate, endDate) where endDate is check-out.
      for (let cursor = new Date(from); cursor < to; cursor.setDate(cursor.getDate() + 1)) {
        const dayOfWeek = cursor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
        if (!workingSet.has(dayOfWeek)) {
          return {
            code: CloudFunctionErrorCode.OUTSIDE_AVAILABILITY,
            message: 'Selected dates include non-working days in workspace settings.',
          };
        }

        if (blockedDaySet.has(dayOfWeek)) {
          return {
            code: CloudFunctionErrorCode.BLOCKED_PERIOD_CONFLICT,
            message: 'Selected dates include blocked days in workspace settings.',
          };
        }
      }

      return null;
    }

    const startDateTime = start.toDate();
    const endDateTime = end.toDate();
    let cursor = new Date(startDateTime);

    while (cursor < endDateTime) {
      const dayOfWeek = cursor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      if (!workingSet.has(dayOfWeek)) {
        return {
          code: CloudFunctionErrorCode.OUTSIDE_AVAILABILITY,
          message: 'Selected time range includes non-working days in workspace settings.',
        };
      }

      if (blockedDaySet.has(dayOfWeek)) {
        return {
          code: CloudFunctionErrorCode.BLOCKED_PERIOD_CONFLICT,
          message: 'Selected time range includes blocked days in workspace settings.',
        };
      }

      if (blockedHourSet.has(cursor.getHours())) {
        return {
          code: CloudFunctionErrorCode.BLOCKED_PERIOD_CONFLICT,
          message: 'Selected time range includes blocked hours in workspace settings.',
        };
      }

      // Move to next hour boundary to efficiently scan any touched hours.
      const nextHour = new Date(cursor);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);
      cursor = nextHour;
    }

    return null;
  }

  private parseDateOnly(value: string): Date {
    const [y, m, d] = value.split('-').map((part) => Number(part));
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private toDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const snapshot = await getDoc(doc(this.firestore, `workspaces/${workspaceId}`) as any);
    if (!snapshot.exists()) return null;
    return snapshot.data() as Workspace;
  }

  private async syncPublicBusySlot(
    workspaceId: string,
    slot: PublicBusySlot,
  ): Promise<void> {
    const publicRef = doc(this.firestore, this.publicBusyDocPath(workspaceId, slot.reservationId));

    // Busy-only public calendar exposes only confirmed reservations.
    if (slot.status !== ReservationStatus.CONFIRMED) {
      await deleteDoc(publicRef).catch(() => undefined);
      return;
    }

    await setDoc(publicRef, {
      reservationId: slot.reservationId,
      resourceId: slot.resourceId,
      resourceName: slot.resourceName,
      start: slot.start,
      end: slot.end,
      startDate: slot.startDate,
      endDate: slot.endDate,
      status: slot.status,
    });
  }

  private publicBusyColPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/publicBusySlots`;
  }

  private publicBusyDocPath(workspaceId: string, reservationId: string): string {
    return `workspaces/${workspaceId}/publicBusySlots/${reservationId}`;
  }
}
