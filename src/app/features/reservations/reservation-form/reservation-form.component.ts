import { Component, signal, inject, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatStepperModule } from '@angular/material/stepper';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';
import { from, of } from 'rxjs';
import { ResourceRepository } from '../../../core/services/resource.repository';
import { ReservationRepository } from '../../../core/services/reservation.repository';
import { CustomerRepository } from '../../../core/services/customer.repository';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../services/auth.service';
import { Resource } from '../../../core/models/resource.model';
import { WorkspaceCustomer } from '../../../core/models/customer.model';
import { BookingMode, PaymentStatus } from '../../../core/models/enums';
import { RecurrenceRule } from '../../../core/models/recurrence.model';
import {
  BookingWindowDto,
  SeriesOccurrencePreview,
  SeriesPreviewRequest,
} from '../../../core/dtos/reservation.dto';
import { RecurrenceEditorComponent } from '../recurrence-editor/recurrence-editor.component';

interface BookingWindowValue {
  startDate: Date | null;
  endDate: Date | null;
  startDatetime: string;
  endDatetime: string;
}

@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatStepperModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    RecurrenceEditorComponent,
  ],
  templateUrl: './reservation-form.component.html',
  styleUrl: './reservation-form.component.scss',
})
export class ReservationFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private resRepo = inject(ReservationRepository);
  private resRepo2 = inject(ResourceRepository);
  private customerRepo = inject(CustomerRepository);
  ws = inject(WorkspaceService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);

  readonly BookingMode = BookingMode;
  readonly PaymentStatus = PaymentStatus;

  isLoading = signal(false);
  today = new Date();

  // All active resources — use listAll to avoid composite index requirement
  resources = toSignal(
    toObservable(this.ws.activeWorkspaceId).pipe(
      switchMap((wid) => wid ? this.resRepo2.listAll(wid) : of([] as Resource[])),
    ),
    { initialValue: [] as Resource[] },
  );

  customerLookupQuery = signal('');
  recentCustomers = toSignal(
    toObservable(this.ws.activeWorkspaceId).pipe(
      switchMap((wid) => wid ? this.customerRepo.listRecent(wid, 120) : of([] as WorkspaceCustomer[])),
    ),
    { initialValue: [] as WorkspaceCustomer[] },
  );
  filteredCustomers = computed(() => {
    const all = this.recentCustomers();
    const q = this.customerLookupQuery().trim().toLowerCase();
    if (!q) return all.slice(0, 10);

    return all
      .filter((customer) =>
        customer.nameLower.includes(q) ||
        customer.phoneNormalized.includes(this.normalizePhone(q)) ||
        (customer.email ?? '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  });

  selectedResource = signal<Resource | null>(null);
  estimatedNights = signal(1);
  estimatedTotal = computed(() => {
    const r = this.selectedResource();
    if (!r) return 0;
    return r.basePrice * this.estimatedNights();
  });

  // ── Step 1: Resource + dates ──────────────────────────────────────────
  bookingForm = this.fb.nonNullable.group({
    resourceId: ['', Validators.required],
    // DATE_RANGE — holds Date objects from mat-datepicker
    startDate: [null as Date | null],
    endDate: [null as Date | null],
    // DATETIME_RANGE
    startDatetime: [''],
    endDatetime: [''],
    notes: [''],
  });

  // ── Recurrence (step 1) ───────────────────────────────────────────────
  recurrence = signal<RecurrenceRule | null>(null);
  recurrenceValid = signal(true);
  skipConflicts = signal(false);
  previewLoading = signal(false);

  // Silent form updates do not emit valueChanges, so they bump this counter explicitly.
  private bookingRevision = signal(0);
  private bookingValue = computed(() => {
    this.bookingRevision();
    return this.bookingForm.getRawValue();
  });

  firstStart = computed<Date | null>(() => {
    const resource = this.selectedResource();
    const value = this.bookingValue();
    if (!resource) return null;
    if (resource.bookingMode === BookingMode.DATE_RANGE) return value.startDate;

    const start = value.startDatetime ? new Date(value.startDatetime) : null;
    return start && !isNaN(start.getTime()) ? start : null;
  });

  private previewRequest = computed<SeriesPreviewRequest | null>(() => {
    const workspaceId = this.ws.activeWorkspaceId();
    const resource = this.selectedResource();
    const recurrence = this.recurrence();
    if (!workspaceId || !resource || !recurrence) return null;

    const window = this.bookingWindow(resource, this.bookingValue());
    return window ? { ...window, workspaceId, resourceId: resource.resourceId, recurrence } : null;
  });

  seriesPreview = toSignal(
    toObservable(this.previewRequest).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      debounceTime(300),
      switchMap((request) => {
        if (!request) {
          this.previewLoading.set(false);
          return of(null);
        }
        this.previewLoading.set(true);
        return from(this.resRepo.previewSeries(request)).pipe(
          // The repository validates again on submit, so a failed preview must not block the form.
          catchError(() => of(null)),
          finalize(() => this.previewLoading.set(false)),
        );
      }),
    ),
    { initialValue: null as SeriesOccurrencePreview[] | null },
  );

  /** i18n key explaining why a series cannot be submitted yet, or null. */
  seriesBlocker = computed<string | null>(() => {
    const preview = this.seriesPreview();
    if (!this.recurrence() || !preview) return null;

    const bookable = preview.filter((item) => item.status === 'OK').length;
    if (bookable === 0) return 'RESERVATION_FORM.RECURRENCE.BLOCK_NONE_AVAILABLE';
    if (bookable < preview.length && !this.skipConflicts()) {
      return 'RESERVATION_FORM.RECURRENCE.BLOCK_UNAVAILABLE';
    }
    return null;
  });

  seriesBookableCount = computed(
    () => this.seriesPreview()?.filter((item) => item.status === 'OK').length ?? 0,
  );

  // ── Step 2: Guest info ────────────────────────────────────────────────
  guestForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', Validators.required],
    email: ['', Validators.email],
    guestNotes: [''],
  });

  // ── Step 3: Payment ───────────────────────────────────────────────────
  paymentForm = this.fb.nonNullable.group({
    totalAmount: [0, [Validators.required, Validators.min(0)]],
    paymentStatus: [PaymentStatus.UNPAID, Validators.required],
    paymentMethod: [null as string | null],
    depositAmount: [null as number | null],
  });

  paymentMethods = computed(() => this.ws.paymentMethods());

  constructor() {
    this.bookingForm.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.bookingRevision.update((n) => n + 1));

    effect(() => {
      const status = this.paymentForm.controls.paymentStatus.value;
      const methods = this.paymentMethods();

      if (status !== PaymentStatus.PAID) {
        if (this.paymentForm.controls.paymentMethod.value !== null) {
          this.paymentForm.controls.paymentMethod.setValue(null);
        }
        return;
      }

      const current = this.paymentForm.controls.paymentMethod.value;
      if (!current || !methods.includes(current)) {
        this.paymentForm.controls.paymentMethod.setValue('Cash');
      }
    });

    effect(() => {
      const allResources = this.resources();
      const selectedId = this.bookingForm.controls.resourceId.value;

      if (!selectedId) {
        this.selectedResource.set(null);
        return;
      }

      const selected = allResources.find((x) => x.resourceId === selectedId) ?? null;
      this.selectedResource.set(selected);
    });

    effect(() => {
      const allResources = this.resources();
      if (allResources.length !== 1) {
        return;
      }

      const selectedId = this.bookingForm.controls.resourceId.value;
      const onlyResourceId = allResources[0].resourceId;
      const selectedExists = allResources.some((resource) => resource.resourceId === selectedId);

      if (!selectedId || !selectedExists) {
        this.bookingForm.controls.resourceId.setValue(onlyResourceId);
      }
    });
  }

  ngOnInit(): void {
    this.bookingForm.controls.resourceId.valueChanges.subscribe((id) => {
      const r = this.resources().find((x) => x.resourceId === id) ?? null;
      this.selectedResource.set(r);
      if (r) this.paymentForm.controls.totalAmount.setValue(r.basePrice);
    });

    this.bookingForm.controls.startDate.valueChanges.subscribe(() => {
      this.ensureMinimumOneNight(false);
      this.recalcNights();
    });
    this.bookingForm.controls.endDate.valueChanges.subscribe(() => {
      this.ensureMinimumOneNight(false);
      this.recalcNights();
    });

    // Prefill from calendar navigation query params.
    const query = this.route.snapshot.queryParamMap;

    const dateParam = query.get('date');
    if (dateParam) {
      const prefilledDate = new Date(dateParam + 'T00:00:00');
      if (!isNaN(prefilledDate.getTime())) {
        this.bookingForm.controls.startDate.setValue(prefilledDate);
      }
    }

    const resourceIdParam = query.get('resourceId');
    if (resourceIdParam) {
      this.bookingForm.controls.resourceId.setValue(resourceIdParam);
    }

    const startParam = query.get('start');
    const endParam = query.get('end');
    if (this.isValidDateTimeLocal(startParam) && this.isValidDateTimeLocal(endParam)) {
      const startDate = new Date(startParam as string);
      const endDate = new Date(endParam as string);

      if (startDate < endDate) {
        this.bookingForm.controls.startDatetime.setValue(startParam as string);
        this.bookingForm.controls.endDatetime.setValue(endParam as string);
      }
    }
  }

  minCheckoutDate(): Date {
    const start = this.bookingForm.controls.startDate.value;
    if (!start) return this.addDays(this.startOfDay(this.today), 1);
    return this.addDays(this.startOfDay(start), 1);
  }

  private toDateStr(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private recalcNights(): void {
    const start = this.bookingForm.controls.startDate.value;
    const end = this.bookingForm.controls.endDate.value;
    if (start && end) {
      const nights = Math.max(1,
        (end.getTime() - start.getTime()) / 86400000,
      );
      this.estimatedNights.set(Math.floor(nights));
      const r = this.selectedResource();
      if (r) this.paymentForm.controls.totalAmount.setValue(r.basePrice * Math.floor(nights));
    }
  }

  get isDateRange(): boolean {
    return this.selectedResource()?.bookingMode === BookingMode.DATE_RANGE;
  }

  async onSubmit(): Promise<void> {
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    const r = this.selectedResource();
    if (!wid || !uid || !r) return;

    const workspaceViolation = this.getWorkspaceRuleViolation();
    if (workspaceViolation) {
      this.snack.open(workspaceViolation, this.t('COMMON.CLOSE'), { duration: 5000 });
      return;
    }

    this.isLoading.set(true);
    try {
      this.ensureMinimumOneNight(true);
      const bv = this.bookingForm.getRawValue();
      const gv = this.guestForm.getRawValue();
      const pv = this.paymentForm.getRawValue();

      const payload: any = {
        workspaceId: wid,
        resourceId: r.resourceId,
        resourceName: r.name,
        resourceType: r.type,
        customer: {
          name: gv.name,
          phone: gv.phone,
          email: gv.email || null,
          notes: gv.guestNotes || null,
        },
        notes: bv.notes || null,
        price: {
          amount: pv.totalAmount,
          currency: this.ws.currency(),
          unit: r.priceUnit,
          quantity: this.estimatedNights(),
          basePrice: r.basePrice,
        },
        paymentStatus: pv.paymentStatus,
        paymentMethod: pv.paymentStatus === PaymentStatus.PAID ? (pv.paymentMethod ?? 'Cash') : null,
        deposit: pv.depositAmount ? {
          amount: pv.depositAmount,
          status: PaymentStatus.UNPAID,
        } : null,
      };

      if (r.bookingMode === BookingMode.DATE_RANGE) {
        payload.bookingMode = BookingMode.DATE_RANGE;
        payload.startDate = this.toDateStr(bv.startDate);
        payload.endDate = this.toDateStr(bv.endDate);
      } else {
        payload.bookingMode = BookingMode.DATETIME_RANGE;
        payload.start = new Date(bv.startDatetime).toISOString();
        payload.end = new Date(bv.endDatetime).toISOString();
      }

      const recurrence = this.recurrence();
      if (recurrence) {
        payload.recurrence = recurrence;
        payload.skipConflictingOccurrences = this.skipConflicts();
      }

      const result = await this.resRepo.create(payload);
      if (result.success) {
        const rid = result.data.reservationId;
        try {
          await this.customerRepo.upsertFromBooking(wid, {
            name: gv.name,
            phone: gv.phone,
            email: gv.email || null,
            notes: gv.guestNotes || null,
          });
        } catch {
          // Do not block booking flow if customer registry update fails.
        }

        const message = result.data.createdCount
          ? this.t('RESERVATION_FORM.RECURRENCE.SERIES_CREATED', { count: result.data.createdCount })
          : this.t('RESERVATION_FORM.BOOKING_CREATED');
        this.snack.open(message, this.t('RESERVATION_FORM.VIEW'), { duration: 4000 }).onAction().subscribe(() => {
          this.router.navigate(['/reservations', rid]);
        });
        this.router.navigate(['/reservations']);
      } else {
        this.snack.open(result.message ?? this.t('RESERVATION_FORM.ERROR_CREATE_BOOKING'), this.t('COMMON.CLOSE'), { duration: 5000 });
      }
    } catch (error) {
      console.error('Error creating reservation:', error);
      this.snack.open(this.t('RESERVATION_FORM.ERROR_UNEXPECTED'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  private getWorkspaceRuleViolation(): string | null {
    const resource = this.selectedResource();
    if (!resource) return this.t('RESERVATION_FORM.ERROR_SELECT_RESOURCE');

    const rules = this.ws.workspaceSettings().operatingRules;
    const workingDays = new Set(rules.workingDays);
    const blockedDays = new Set(rules.blockedDays);
    const blockedHours = new Set(rules.blockedHours);

    if (resource.bookingMode === BookingMode.DATE_RANGE) {
      const start = this.bookingForm.controls.startDate.value;
      const end = this.bookingForm.controls.endDate.value;
      if (!start || !end) return this.t('RESERVATION_FORM.ERROR_SELECT_CHECKIN_CHECKOUT');

      if (this.startOfDay(end).getTime() <= this.startOfDay(start).getTime()) {
        return this.t('RESERVATION_FORM.ERROR_CHECKOUT_AFTER_CHECKIN');
      }

      for (let cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
        const day = cursor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
        if (!workingDays.has(day)) {
          return this.t('RESERVATION_FORM.ERROR_NON_WORKING_DAYS');
        }
        if (blockedDays.has(day)) {
          return this.t('RESERVATION_FORM.ERROR_BLOCKED_DAYS');
        }
      }

      return null;
    }

    const startRaw = this.bookingForm.controls.startDatetime.value;
    const endRaw = this.bookingForm.controls.endDatetime.value;
    if (!startRaw || !endRaw) {
      return this.t('RESERVATION_FORM.ERROR_SELECT_START_END_DATETIME');
    }

    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return this.t('RESERVATION_FORM.ERROR_START_BEFORE_END');
    }

    let cursor = new Date(start);
    while (cursor < end) {
      const day = cursor.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      if (!workingDays.has(day)) {
        return this.t('RESERVATION_FORM.ERROR_RANGE_NON_WORKING_DAYS');
      }
      if (blockedDays.has(day)) {
        return this.t('RESERVATION_FORM.ERROR_RANGE_BLOCKED_DAYS');
      }
      if (blockedHours.has(cursor.getHours())) {
        return this.t('RESERVATION_FORM.ERROR_RANGE_BLOCKED_HOURS');
      }

      const nextHour = new Date(cursor);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);
      cursor = nextHour;
    }

    return null;
  }

  private ensureMinimumOneNight(showNotice: boolean): void {
    if (!this.isDateRange) return;

    const start = this.bookingForm.controls.startDate.value;
    if (!start) return;

    const normalizedStart = this.startOfDay(start);
    if (normalizedStart.getTime() !== start.getTime()) {
      this.bookingForm.controls.startDate.setValue(normalizedStart, { emitEvent: false });
      this.bookingRevision.update((n) => n + 1);
    }

    const end = this.bookingForm.controls.endDate.value;
    const normalizedEnd = end ? this.startOfDay(end) : null;
    if (!normalizedEnd || normalizedEnd.getTime() <= normalizedStart.getTime()) {
      this.bookingForm.controls.endDate.setValue(this.addDays(normalizedStart, 1), { emitEvent: false });
      this.bookingRevision.update((n) => n + 1);
      if (showNotice) {
        this.snack.open(this.t('RESERVATION_FORM.CHECKOUT_ADJUSTED'), this.t('COMMON.CLOSE'), {
          duration: 3500,
        });
      }
    }
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return this.startOfDay(next);
  }

  /** The booking dates as a create-request fragment, or null while they are incomplete or invalid. */
  private bookingWindow(resource: Resource, value: BookingWindowValue): BookingWindowDto | null {
    if (resource.bookingMode === BookingMode.DATE_RANGE) {
      const { startDate, endDate } = value;
      if (!startDate || !endDate || this.startOfDay(endDate) <= this.startOfDay(startDate)) return null;
      return {
        bookingMode: BookingMode.DATE_RANGE,
        startDate: this.toDateStr(startDate),
        endDate: this.toDateStr(endDate),
      };
    }

    if (!this.isValidDateTimeLocal(value.startDatetime) || !this.isValidDateTimeLocal(value.endDatetime)) {
      return null;
    }
    if (new Date(value.startDatetime) >= new Date(value.endDatetime)) return null;
    return {
      bookingMode: BookingMode.DATETIME_RANGE,
      start: value.startDatetime,
      end: value.endDatetime,
    };
  }

  onCustomerLookupInput(event: Event): void {
    this.customerLookupQuery.set((event.target as HTMLInputElement).value);
  }

  selectCustomerById(customerId: string): void {
    const customer = this.recentCustomers().find((x) => x.customerId === customerId);
    if (!customer) return;

    this.guestForm.patchValue({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      guestNotes: customer.notes ?? '',
    });
    this.customerLookupQuery.set(this.customerOptionLabel(customer));
  }

  customerOptionLabel(customer: WorkspaceCustomer): string {
    return `${customer.name} - ${customer.phone}`;
  }

  private normalizePhone(value: string): string {
    const hasPlus = value.startsWith('+');
    const digits = value.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  }

  private isValidDateTimeLocal(value: string | null): boolean {
    if (!value) return false;
    return !isNaN(new Date(value).getTime());
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
