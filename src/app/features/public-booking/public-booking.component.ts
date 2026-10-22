import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { BookingMode, PaymentStatus } from '../../core/models/enums';
import { ResourceRepository } from '../../core/services/resource.repository';
import {
  PublicBusySlot,
  ReservationRepository,
} from '../../core/services/reservation.repository';
import { LanguageService } from '../../core/services/language.service';
import { SeoService } from '../../core/services/seo.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AuthService } from '../../services/auth.service';

interface PublicCalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isPast: boolean;
  isReserved: boolean;
  isSelectedStart: boolean;
  isSelectedEnd: boolean;
  isInSelection: boolean;
}

interface PublicHourSlot {
  hour: number;
  label: string;
  isReserved: boolean;
  isPast: boolean;
  isSelectedStart: boolean;
  isSelectedEnd: boolean;
  isInSelection: boolean;
}

@Component({
  selector: 'app-public-booking',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './public-booking.component.html',
  styleUrl: './public-booking.component.scss',
})
export class PublicBookingComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private resourcesRepo = inject(ResourceRepository);
  private reservationsRepo = inject(ReservationRepository);
  private workspaceService = inject(WorkspaceService);
  private authService = inject(AuthService);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private seo = inject(SeoService);
  readonly languageService = inject(LanguageService);
  readonly currentUser = toSignal(this.authService.user$, { initialValue: null });

  readonly BookingMode = BookingMode;

  workspaceId = this.route.snapshot.paramMap.get('workspaceId') ?? '';
  monthCursor = signal(new Date());
  selectedHourDate = signal(this.startOfDay(new Date()));
  isSubmitting = signal(false);
  publicAccessError = signal<string | null>(null);
  readonly weekDays = [
    'PUBLIC_BOOKING.DAY_MON',
    'PUBLIC_BOOKING.DAY_TUE',
    'PUBLIC_BOOKING.DAY_WED',
    'PUBLIC_BOOKING.DAY_THU',
    'PUBLIC_BOOKING.DAY_FRI',
    'PUBLIC_BOOKING.DAY_SAT',
    'PUBLIC_BOOKING.DAY_SUN',
  ];

  publicWorkspace = toSignal(
    this.workspaceService.getPublicDirectoryEntry(this.workspaceId),
    { initialValue: null },
  );

  workspacePublicLabel = computed(() => {
    const name = this.publicWorkspace()?.name?.trim();
    if (name) return name;
    return this.slugFromWorkspaceId(this.workspaceId);
  });

  resources = toSignal(
    this.resourcesRepo.listPublicActive(this.workspaceId).pipe(
      catchError((err) => {
        this.publicAccessError.set(this.mapPublicError(err));
        return of([]);
      }),
    ),
    { initialValue: [] },
  );

  requestForm = this.fb.nonNullable.group({
    resourceId: ['', Validators.required],
    startDate: [null as Date | null],
    endDate: [null as Date | null],
    startDatetime: [''],
    endDatetime: [''],
    guestName: ['', [Validators.required, Validators.minLength(2)]],
    guestPhone: ['', Validators.required],
    guestEmail: ['', Validators.email],
    notes: [''],
  });

  resourceIdValue = toSignal(
    this.requestForm.controls.resourceId.valueChanges.pipe(
      startWith(this.requestForm.controls.resourceId.value),
    ),
    { initialValue: '' },
  );

  startDateValue = toSignal(
    this.requestForm.controls.startDate.valueChanges.pipe(
      startWith(this.requestForm.controls.startDate.value),
    ),
    { initialValue: null as Date | null },
  );

  endDateValue = toSignal(
    this.requestForm.controls.endDate.valueChanges.pipe(
      startWith(this.requestForm.controls.endDate.value),
    ),
    { initialValue: null as Date | null },
  );

  startDateTimeValue = toSignal(
    this.requestForm.controls.startDatetime.valueChanges.pipe(
      startWith(this.requestForm.controls.startDatetime.value),
    ),
    { initialValue: '' },
  );

  endDateTimeValue = toSignal(
    this.requestForm.controls.endDatetime.valueChanges.pipe(
      startWith(this.requestForm.controls.endDatetime.value),
    ),
    { initialValue: '' },
  );

  selectedResource = computed(() => {
    const id = this.resourceIdValue();
    return this.resources().find((r) => r.resourceId === id) ?? null;
  });

  selectedResourcePrice = computed(() => {
    const resource = this.selectedResource();
    if (!resource) return '';

    const basePrice = Number(resource.basePrice ?? 0);
    const unitKey = resource.priceUnit ? `RESOURCES.UNIT_${resource.priceUnit}` : '';
    const unit = unitKey ? (this.translate.instant(unitKey) || resource.priceUnit) : '—';

    return `${basePrice} ${unit}`.trim();
  });

  monthDays = computed<PublicCalendarDay[]>(() => {
    const cursor = this.monthCursor();
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startOffset);

    const startDate = this.startDateValue();
    const endDate = this.endDateValue();
    const checkIn = startDate ? this.startOfDay(startDate) : null;
    const lastNight = endDate ? this.addDays(this.startOfDay(endDate), -1) : null;
    const today = this.startOfDay(new Date());

    const cells: PublicCalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);

      const isPast = date < today;
      const isReserved = this.isDateReserved(date);

      const isSelectedStart = Boolean(checkIn && this.isSameDay(checkIn, date));
      const isSelectedEnd = Boolean(lastNight && this.isSameDay(lastNight, date));
      const isInSelection = Boolean(
        checkIn && lastNight && date >= checkIn && date <= lastNight,
      );

      cells.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isPast,
        isReserved,
        isSelectedStart,
        isSelectedEnd,
        isInSelection,
      });
    }

    return cells;
  });

  selectedDateRangeLabel = computed(() => {
    const start = this.startDateValue();
    const end = this.endDateValue();
    if (!start || !end) return this.t('PUBLIC_BOOKING.CLICK_DAY_TO_START');

    const nights = Math.max(
      1,
      Math.round((this.startOfDay(end).getTime() - this.startOfDay(start).getTime()) / 86400000),
    );
    return this.t('PUBLIC_BOOKING.DATE_RANGE_SELECTION', {
      start: start.toLocaleDateString(this.localeCode()),
      end: end.toLocaleDateString(this.localeCode()),
      nights,
    });
  });

  hourSlots = computed<PublicHourSlot[]>(() => {
    const day = this.selectedHourDate();
    const now = new Date();
    const startHour = this.selectedHourStart();
    const endHour = this.selectedHourEnd();

    return Array.from({ length: 24 }, (_, hour) => {
      const slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
      const isPast = slotStart.getTime() < now.getTime();
      const isReserved = this.isHourReserved(day, hour);
      const isSelectedStart = startHour === hour;
      const isSelectedEnd = endHour === hour + 1;
      const isInSelection = startHour !== null && endHour !== null && hour >= startHour && hour < endHour;

      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        isReserved,
        isPast,
        isSelectedStart,
        isSelectedEnd,
        isInSelection,
      };
    });
  });

  selectedHourStart = signal<number | null>(null);
  selectedHourEnd = signal<number | null>(null);

  selectedDateTimeLabel = computed(() => {
    const start = this.startDateTimeValue();
    const end = this.endDateTimeValue();
    if (!start) return this.t('PUBLIC_BOOKING.CLICK_HOUR_TO_START');
    if (!end) {
      return this.t('PUBLIC_BOOKING.START_SELECTED', {
        start: new Date(start).toLocaleString(this.localeCode()),
      });
    }
    return this.t('PUBLIC_BOOKING.TIME_RANGE_SELECTION', {
      start: new Date(start).toLocaleString(this.localeCode()),
      end: new Date(end).toLocaleString(this.localeCode()),
    });
  });

  busySlots = toSignal(
    combineLatest([
      toObservable(this.monthCursor),
      toObservable(this.resourceIdValue),
    ]).pipe(
      switchMap(([cursor, resourceId]) => {
        if (!this.workspaceId) return of([] as PublicBusySlot[]);

        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const winStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const winEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const tsStart = new Date(year, month, 1, 0, 0, 0).getTime();
        const tsEnd = new Date(year, month, lastDay, 23, 59, 59).getTime();

        const byDate$ = this.reservationsRepo.listPublicBusySlotsForDateWindow(
          this.workspaceId,
          winStart,
          winEnd,
          resourceId || undefined,
        );
        const byDateTime$ = this.reservationsRepo.listPublicBusySlotsForDateTimeWindow(
          this.workspaceId,
          tsStart,
          tsEnd,
          resourceId || undefined,
        );

        return combineLatest([byDate$, byDateTime$]).pipe(
          map(([dateSlots, dateTimeSlots]) => {
            const seen = new Set<string>();
            return [...dateSlots, ...dateTimeSlots].filter((slot) => {
              if (seen.has(slot.reservationId)) return false;
              seen.add(slot.reservationId);
              return true;
            });
          }),
          catchError((err) => {
            this.publicAccessError.set(this.mapPublicError(err));
            return of([] as PublicBusySlot[]);
          }),
        );
      }),
    ),
    { initialValue: [] as PublicBusySlot[] },
  );

  constructor() {
    effect(() => {
      const workspace = this.publicWorkspace();
      const lang = this.languageService.language();
      const isArabic = lang === 'ar';
      const name = workspace?.name?.trim() || this.workspacePublicLabel();
      const title = isArabic
        ? `احجز الآن - ${name}`
        : `Book Now - ${name}`;
      const description = isArabic
        ? `تحقق من توفر ${name} وقدّم طلب الحجز مباشرة عبر StayManager.`
        : `Check live availability for ${name} and submit your booking request instantly with StayManager.`;

      this.seo.setPageSeo({
        title,
        description,
        canonicalPath: `/book/${this.workspaceId}`,
        robots: 'index, follow',
        ogType: 'website',
      });

      const pageUrl = `https://staymanager-15f31.web.app/book/${this.workspaceId}`;
      const graph: Array<Record<string, unknown>> = [
        {
          '@type': 'WebPage',
          name: title,
          url: pageUrl,
          inLanguage: isArabic ? 'ar' : 'en',
          description,
        },
      ];

      if (workspace) {
        graph.push({
          '@type': 'LocalBusiness',
          name,
          url: workspace.websiteUrl
            ? (/^https?:\/\//i.test(workspace.websiteUrl) ? workspace.websiteUrl : `https://${workspace.websiteUrl}`)
            : pageUrl,
          telephone: workspace.phone ?? undefined,
          address: workspace.address ?? undefined,
        });
      }

      this.seo.setStructuredDataGraph(graph);
    });

    effect(() => {
      const resource = this.selectedResource();
      if (!resource) return;

      if (resource.bookingMode === BookingMode.DATE_RANGE) {
        this.requestForm.controls.startDatetime.setValue('');
        this.requestForm.controls.endDatetime.setValue('');
        this.selectedHourStart.set(null);
        this.selectedHourEnd.set(null);

        const start = this.startDateValue();
        const end = this.endDateValue();
        if (start) {
          const startDay = this.startOfDay(start);
          const endDay = end ? this.startOfDay(end) : null;
          if (!endDay || endDay.getTime() <= startDay.getTime()) {
            this.requestForm.controls.endDate.setValue(this.addDays(startDay, 1), { emitEvent: false });
          }
        }
      } else {
        this.requestForm.controls.startDate.setValue(null);
        this.requestForm.controls.endDate.setValue(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.seo.clearPageSeo();
  }

  minPublicCheckoutDate(): Date {
    const start = this.requestForm.controls.startDate.value;
    if (!start) return this.addDays(this.startOfDay(new Date()), 1);
    return this.addDays(this.startOfDay(start), 1);
  }

  isDateRangeMode(): boolean {
    return this.selectedResource()?.bookingMode === BookingMode.DATE_RANGE;
  }

  prevMonth(): void {
    this.monthCursor.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    this.monthCursor.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  monthLabel(): string {
    return this.monthCursor().toLocaleDateString(this.localeCode(), { month: 'long', year: 'numeric' });
  }

  hourDateLabel(): string {
    return this.selectedHourDate().toLocaleDateString(this.localeCode(), {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  prevHourDate(): void {
    this.shiftHourDate(-1);
  }

  nextHourDate(): void {
    this.shiftHourDate(1);
  }

  onHourDatePicked(date: Date | null): void {
    if (!date) return;
    this.selectedHourDate.set(this.startOfDay(date));
    this.clearHourSelection();
  }

  selectDateCell(day: PublicCalendarDay): void {
    if (!this.isDateRangeMode()) return;
    if (day.isReserved || day.isPast || !day.isCurrentMonth) return;

    const clicked = this.startOfDay(day.date);
    const currentStart = this.requestForm.controls.startDate.value
      ? this.startOfDay(this.requestForm.controls.startDate.value as Date)
      : null;
    const currentEnd = this.requestForm.controls.endDate.value;

    if (!currentStart || currentEnd) {
      this.requestForm.controls.startDate.setValue(clicked);
      this.requestForm.controls.endDate.setValue(this.addDays(clicked, 1));
      return;
    }

    if (clicked <= currentStart) {
      this.requestForm.controls.startDate.setValue(clicked);
      this.requestForm.controls.endDate.setValue(this.addDays(clicked, 1));
      return;
    }

    if (this.hasReservedInRange(currentStart, clicked)) {
      this.snack.open(this.t('PUBLIC_BOOKING.ERROR_RESERVED_NIGHTS_RANGE'), this.t('COMMON.CLOSE'), {
        duration: 4000,
      });
      return;
    }

    this.requestForm.controls.startDate.setValue(currentStart);
    this.requestForm.controls.endDate.setValue(this.addDays(clicked, 1));
  }

  selectHour(hour: number): void {
    if (this.isHourReserved(this.selectedHourDate(), hour)) return;

    const slotStart = new Date(
      this.selectedHourDate().getFullYear(),
      this.selectedHourDate().getMonth(),
      this.selectedHourDate().getDate(),
      hour,
      0,
      0,
      0,
    );

    if (slotStart.getTime() < new Date().getTime()) return;

    const startHour = this.selectedHourStart();
    const endHour = this.selectedHourEnd();

    if (startHour === null) {
      this.selectedHourStart.set(hour);
      this.selectedHourEnd.set(null);
      this.updateDateTimeInputs();
      return;
    }

    if (endHour !== null) {
      this.selectedHourStart.set(hour);
      this.selectedHourEnd.set(null);
      this.updateDateTimeInputs();
      return;
    }

    if (hour <= startHour) {
      this.selectedHourStart.set(hour);
      this.selectedHourEnd.set(null);
      this.updateDateTimeInputs();
      return;
    }

    if (this.hasReservedHours(startHour, hour + 1)) {
      this.snack.open(this.t('PUBLIC_BOOKING.ERROR_RESERVED_HOURS_RANGE'), this.t('COMMON.CLOSE'), {
        duration: 4000,
      });
      return;
    }

    this.selectedHourEnd.set(hour + 1);
    this.updateDateTimeInputs();
  }

  async submitRequest(): Promise<void> {
    const resource = this.selectedResource();
    if (!resource || !this.workspaceId) return;

    if (!this.authService.getCurrentUser()) {
      this.snack.open(
        'Please log in or create an account to complete this public booking request.',
        'Close',
        { duration: 5000 },
      );
      await this.router.navigate(['/login']);
      return;
    }

    const v = this.requestForm.getRawValue();
    this.isSubmitting.set(true);

    try {
      const payload: any = {
        workspaceId: this.workspaceId,
        resourceId: resource.resourceId,
        resourceName: resource.name,
        resourceType: resource.type,
        bookingMode: resource.bookingMode,
        customer: {
          name: v.guestName,
          phone: v.guestPhone,
          email: v.guestEmail || null,
          notes: null,
        },
        notes: v.notes || null,
        paymentStatus: PaymentStatus.UNPAID,
        isPublicRequest: true,
      };

      if (resource.bookingMode === BookingMode.DATE_RANGE) {
        if (!v.startDate || !v.endDate) {
          this.snack.open(this.t('PUBLIC_BOOKING.ERROR_SELECT_CHECKIN_CHECKOUT'), this.t('COMMON.CLOSE'), { duration: 4000 });
          return;
        }

        const startDay = this.startOfDay(v.startDate);
        const endDay = this.startOfDay(v.endDate);
        if (endDay.getTime() <= startDay.getTime()) {
          const corrected = this.addDays(startDay, 1);
          this.requestForm.controls.endDate.setValue(corrected, { emitEvent: false });
          payload.startDate = this.toDateStr(startDay);
          payload.endDate = this.toDateStr(corrected);
          this.snack.open(this.t('PUBLIC_BOOKING.CHECKOUT_ADJUSTED'), this.t('COMMON.CLOSE'), {
            duration: 3500,
          });
        } else {
          payload.startDate = this.toDateStr(startDay);
          payload.endDate = this.toDateStr(endDay);
        }
      } else {
        if (!v.startDatetime || !v.endDatetime) {
          this.snack.open(this.t('PUBLIC_BOOKING.ERROR_SELECT_START_END_DATETIME'), this.t('COMMON.CLOSE'), { duration: 4000 });
          return;
        }
        payload.start = new Date(v.startDatetime).toISOString();
        payload.end = new Date(v.endDatetime).toISOString();
      }

      const result = await this.reservationsRepo.create(payload);
      if (!result.success) {
        this.snack.open(result.message || this.t('PUBLIC_BOOKING.ERROR_REQUEST_FAILED'), this.t('COMMON.CLOSE'), { duration: 5000 });
        return;
      }

      this.snack.open(this.t('PUBLIC_BOOKING.REQUEST_SUBMITTED'), this.t('COMMON.CLOSE'), {
        duration: 5000,
      });
      this.requestForm.reset({
        resourceId: '',
        startDate: null,
        endDate: null,
        startDatetime: '',
        endDatetime: '',
        guestName: '',
        guestPhone: '',
        guestEmail: '',
        notes: '',
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private shiftHourDate(delta: number): void {
    const next = new Date(this.selectedHourDate());
    next.setDate(next.getDate() + delta);
    this.selectedHourDate.set(this.startOfDay(next));
    this.clearHourSelection();
  }

  private clearHourSelection(): void {
    this.selectedHourStart.set(null);
    this.selectedHourEnd.set(null);
    this.requestForm.controls.startDatetime.setValue('');
    this.requestForm.controls.endDatetime.setValue('');
  }

  private updateDateTimeInputs(): void {
    const startHour = this.selectedHourStart();
    const endHour = this.selectedHourEnd();
    if (startHour === null) return;

    const day = this.selectedHourDate();
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, 0, 0, 0);
    this.requestForm.controls.startDatetime.setValue(this.toDateTimeLocal(start));

    if (endHour === null) {
      this.requestForm.controls.endDatetime.setValue('');
      return;
    }

    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), endHour, 0, 0, 0);
    this.requestForm.controls.endDatetime.setValue(this.toDateTimeLocal(end));
  }

  private isDateReserved(date: Date): boolean {
    const dayStart = this.startOfDay(date).getTime();
    const dayEnd = this.addDays(this.startOfDay(date), 1).getTime();

    return this.busySlots().some((slot) => {
      if (slot.startDate && slot.endDate) {
        const start = this.parseDateOnly(slot.startDate).getTime();
        const endExclusive = this.parseDateOnly(slot.endDate).getTime();
        return dayStart >= start && dayStart < endExclusive;
      }

      const startMs = slot.start.toDate().getTime();
      const endMs = slot.end.toDate().getTime();
      return startMs < dayEnd && endMs > dayStart;
    });
  }

  private hasReservedInRange(start: Date, endInclusive: Date): boolean {
    for (let day = new Date(start); day <= endInclusive; day = this.addDays(day, 1)) {
      if (this.isDateReserved(day)) return true;
    }
    return false;
  }

  private isHourReserved(day: Date, hour: number): boolean {
    const slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0).getTime();
    const slotEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour + 1, 0, 0, 0).getTime();

    return this.busySlots().some((slot) => {
      const startMs = slot.start.toDate().getTime();
      const endMs = slot.end.toDate().getTime();
      return startMs < slotEnd && endMs > slotStart;
    });
  }

  private hasReservedHours(startHour: number, endHourExclusive: number): boolean {
    for (let h = startHour; h < endHourExclusive; h++) {
      if (this.isHourReserved(this.selectedHourDate(), h)) return true;
    }
    return false;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return this.startOfDay(next);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map((v) => Number(v));
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  private toDateTimeLocal(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:00`;
  }

  private mapPublicError(err: unknown): string {
    const message = String((err as any)?.message ?? '').toLowerCase();
    if (message.includes('missing or insufficient permissions')) {
      return this.t('PUBLIC_BOOKING.ERROR_ACCESS_NOT_ENABLED');
    }
    return this.t('PUBLIC_BOOKING.ERROR_LOAD_AVAILABILITY');
  }

  private slugFromWorkspaceId(id: string): string {
    if (!id) return 'public-workspace';
    // Keep only a short neutral suffix to avoid exposing the full document ID.
    return `public-workspace-${id.slice(-4).toLowerCase()}`;
  }

  private toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private localeCode(): string {
    return this.languageService.language() === 'ar' ? 'ar-LB' : 'en-US';
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
