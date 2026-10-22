import { Component, signal, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs/operators';
import { of, combineLatest } from 'rxjs';
import { BookingMode, ResourceType, ReservationStatus } from '../../core/models/enums';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { ResourceRepository } from '../../core/services/resource.repository';
import { WorkspaceService } from '../../core/services/workspace.service';
import { LanguageService } from '../../core/services/language.service';
import { Reservation } from '../../core/models/reservation.model';
import { Resource } from '../../core/models/resource.model';

export interface CalendarEvent {
  id: string;
  guestName: string;
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  checkIn: Date;
  checkOut: Date;
  status: ReservationStatus;
  nights: number;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  eventCount: number;
  pendingEventCount: number;
  additionalEventCount: number;
  events: CalendarEvent[];
}

interface GanttRow {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  events: Array<CalendarEvent & { startCol: number; spanCols: number }>;
}

interface CalendarResource {
  id: string;
  name: string;
  type: ResourceType;
  bookingMode: BookingMode;
}

/** One slot in the hourly week grid: a booking block positioned by start/end hour. */
export interface HourlyBlock {
  event: CalendarEvent;
  dayIndex: number;   // 0–6 column
  startRow: number;   // relative row in visible window
  spanRows: number;   // how many hour rows it spans (min 0.5)
}

type CalendarView = 'month' | 'week' | 'timeline';

@Component({
  selector: 'app-calendar',
  imports: [
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    CommonModule,
    DatePipe,
    TranslatePipe,
    RouterLink,
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent {
  private reservationRepo = inject(ReservationRepository);
  private resourceRepo    = inject(ResourceRepository);
  private ws              = inject(WorkspaceService);
  private router          = inject(Router);
  private snack           = inject(MatSnackBar);
  private translate       = inject(TranslateService);
  readonly languageService = inject(LanguageService);

  view     = signal<CalendarView>(this.ws.calendarView() as CalendarView);
  viewDate = signal(new Date());
  selectedResourceIds = signal<string[]>([]);

  readonly WEEK_DAYS = [
    'CALENDAR.DAY_MON',
    'CALENDAR.DAY_TUE',
    'CALENDAR.DAY_WED',
    'CALENDAR.DAY_THU',
    'CALENDAR.DAY_FRI',
    'CALENDAR.DAY_SAT',
    'CALENDAR.DAY_SUN',
  ];

  weekViewStartHour = computed(() => {
    const hour = this.ws.weekViewStartHour();
    return Math.max(0, Math.min(23, hour));
  });

  weekViewEndHour = computed(() => {
    const hour = this.ws.weekViewEndHour();
    const start = this.weekViewStartHour();
    return Math.max(start + 1, Math.min(24, hour));
  });

  visibleWeekHours = computed(() => {
    const start = this.weekViewStartHour();
    const end = this.weekViewEndHour();
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  /** True when a given hour falls outside the workspace's configured range. */
  isOffHour(h: number): boolean {
    return h < this.weekViewStartHour() || h >= this.weekViewEndHour();
  }

  private wid$ = toObservable(this.ws.activeWorkspaceId);

  // ── Raw Firestore data ───────────────────────────────────────────────────

  private rawResources = toSignal(
    this.wid$.pipe(
      switchMap((wid) => wid ? this.resourceRepo.listAll(wid) : of([])),
    ),
    { initialValue: [] as Resource[] },
  );

  private rawReservations = toSignal(
    toObservable(this.viewDate).pipe(
      switchMap((d) => {
        const wid = this.ws.activeWorkspaceId();
        if (!wid) return of([]);

        const year    = d.getFullYear();
        const month   = d.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const winStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const winEnd   = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const tsStart = new Date(year, month, 1, 0, 0, 0).getTime();
        const tsEnd   = new Date(year, month, lastDay, 23, 59, 59).getTime();

        const dateRange$     = this.reservationRepo.listForDateWindow(wid, winStart, winEnd);
        const datetimeRange$ = this.reservationRepo.listForDateTimeWindow(wid, tsStart, tsEnd);

        return combineLatest([dateRange$, datetimeRange$]).pipe(
          map(([dateRes, dtRes]) => {
            const seen = new Set<string>();
            return [...dateRes, ...dtRes].filter((r) => {
              if (seen.has(r.reservationId)) return false;
              seen.add(r.reservationId);
              return true;
            });
          }),
        );
      }),
    ),
    { initialValue: [] as Reservation[] },
  );

  // ── Mapped events ─────────────────────────────────────────────────────────

  private allEvents = computed<CalendarEvent[]>(() =>
    this.rawReservations()
      .filter((r) =>
        r.status !== ReservationStatus.DELETED &&
        r.status !== ReservationStatus.CANCELLED,
      )
      .map((r) => {
        const checkIn  = r.startDate ? new Date(r.startDate + 'T00:00:00') : r.start.toDate();
        const checkOut = r.endDate   ? new Date(r.endDate   + 'T00:00:00') : r.end.toDate();
        const nights   = Math.max(0, Math.round(
          (checkOut.getTime() - checkIn.getTime()) / 86400000,
        ));
        return {
          id: r.reservationId, guestName: r.customer.name,
          resourceId: r.resourceId, resourceName: r.resourceName,
          resourceType: r.resourceType, checkIn, checkOut, status: r.status, nights,
        };
      }),
  );

  resources = computed<CalendarResource[]>(() =>
    this.rawResources().map((r) => ({
      id: r.resourceId,
      name: r.name,
      type: r.type,
      bookingMode: r.bookingMode,
    })),
  );

  filteredEvents = computed(() => {
    const ids = this.selectedResourceIds();
    if (!ids.length) return this.allEvents();
    return this.allEvents().filter((e) => ids.includes(e.resourceId));
  });

  // ── Month view ────────────────────────────────────────────────────────────

  monthLabel = computed(() =>
    this.viewDate().toLocaleDateString(this.localeCode(), { month: 'long', year: 'numeric' }),
  );

  calendarDays = computed<CalendarDay[]>(() => {
    const d     = this.viewDate();
    const year  = d.getFullYear();
    const month = d.getMonth();
    const firstDay    = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const start       = new Date(firstDay);
    start.setDate(start.getDate() - startOffset);

    const today  = new Date();
    const days: CalendarDay[] = [];
    const events = this.filteredEvents();

    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dayEvents = events.filter((e) => this.eventSpansDay(e, date));
      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday:        this.isSameDay(date, today),
        isWeekend:      date.getDay() === 0 || date.getDay() === 6,
        eventCount: dayEvents.length,
        pendingEventCount: dayEvents.filter((event) => event.status === ReservationStatus.PENDING).length,
        additionalEventCount: Math.max(0, dayEvents.length - 3),
        events:         dayEvents.slice(0, 3),
      });
    }
    return days;
  });

  // ── Week hourly view ─────────────────────────────────────────────────────
  // Shows 7 days (Mon–Sun of the week containing viewDate).
  // Rows = visible hours between weekViewStartHour and weekViewEndHour.
  // Columns = days.

  weekDays = computed<Date[]>(() => {
    const d   = this.viewDate();
    // Find Monday of the current week
    const mon = new Date(d);
    const dow = d.getDay();                     // 0=Sun … 6=Sat
    mon.setDate(d.getDate() - ((dow + 6) % 7)); // shift to Monday
    mon.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(mon);
      day.setDate(mon.getDate() + i);
      return day;
    });
  });

  weekLabel = computed(() => {
    const days  = this.weekDays();
    const start = days[0].toLocaleDateString(this.localeCode(), { month: 'short', day: 'numeric' });
    const end   = days[6].toLocaleDateString(this.localeCode(), { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} – ${end}`;
  });

  /**
   * For each resource, compute hourly blocks for the current week.
   * Block position: dayIndex (0–6 col) + startRow (0–23 hour) + spanRows.
   */
  hourlyRows = computed(() => {
    const days   = this.weekDays();
    const events = this.filteredEvents();
    const visibleStartHour = this.weekViewStartHour();
    const visibleEndHour = this.weekViewEndHour();

    return this.resources().map((resource) => {
      const blocks: HourlyBlock[] = [];

      for (const event of events.filter((e) => e.resourceId === resource.id)) {
        for (let di = 0; di < 7; di++) {
          const day     = days[di];
          const visibleStart = new Date(day);
          visibleStart.setHours(visibleStartHour, 0, 0, 0);
          const visibleEnd = new Date(day);
          if (visibleEndHour === 24) {
            visibleEnd.setDate(visibleEnd.getDate() + 1);
            visibleEnd.setHours(0, 0, 0, 0);
          } else {
            visibleEnd.setHours(visibleEndHour, 0, 0, 0);
          }

          // Skip events that do not intersect the visible window for this day.
          if (event.checkIn >= visibleEnd || event.checkOut <= visibleStart) continue;

          const blockStart = event.checkIn > visibleStart ? event.checkIn : visibleStart;
          const blockEnd = event.checkOut < visibleEnd ? event.checkOut : visibleEnd;

          const startRow = (blockStart.getTime() - visibleStart.getTime()) / 3600000;
          const spanRows = Math.max(0.5, (blockEnd.getTime() - blockStart.getTime()) / 3600000);

          blocks.push({ event, dayIndex: di, startRow, spanRows });
        }
      }

      return {
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.type,
        bookingMode: resource.bookingMode,
        blocks,
      };
    });
  });

  formatHour(h: number): string {
    return `${String(h).padStart(2, '0')}:00`;
  }

  isCurrentHour(h: number): boolean {
    return new Date().getHours() === h;
  }

  isWeekdayToday(date: Date): boolean {
    return this.isSameDay(date, new Date());
  }

  // ── Gantt / monthly timeline ──────────────────────────────────────────────

  timelineDays = computed<Date[]>(() => {
    const d = this.viewDate();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth },
      (_, i) => new Date(d.getFullYear(), d.getMonth(), i + 1));
  });

  ganttRows = computed<GanttRow[]>(() => {
    const days   = this.timelineDays();
    const events = this.filteredEvents().filter(
      (e) =>
        e.checkIn.getMonth()  === this.viewDate().getMonth() ||
        e.checkOut.getMonth() === this.viewDate().getMonth(),
    );

    return this.resources().map((resource) => {
      const resEvents = events
        .filter((e) => e.resourceId === resource.id)
        .map((e) => {
          const start = Math.max(0, this.dayIndex(days, e.checkIn));
          const endInclusive = this.eventEndInclusive(e);
          const end   = Math.min(days.length - 1, this.dayIndex(days, endInclusive));
          return { ...e, startCol: start, spanCols: Math.max(1, end - start + 1) };
        });
      return { resourceId: resource.id, resourceName: resource.name,
               resourceType: resource.type, events: resEvents };
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  prev(): void {
    if (this.view() === 'week') {
      this.viewDate.update((d) => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; });
    } else {
      this.viewDate.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    }
  }

  next(): void {
    if (this.view() === 'week') {
      this.viewDate.update((d) => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; });
    } else {
      this.viewDate.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    }
  }

  goToToday(): void { this.viewDate.set(new Date()); }

  newBookingOnDate(date: Date): void {
    if (!this.isDateBookable(date)) {
      this.snack.open(this.t('CALENDAR.ERROR_DAY_BLOCKED'), this.t('COMMON.CLOSE'), { duration: 3500 });
      return;
    }

    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    this.router.navigate(['/reservations/new'], { queryParams: { date: iso } });
  }

  newBookingOnWeekSlot(resourceId: string, bookingMode: BookingMode, day: Date, hour: number): void {
    if (this.isBlockedHourForDate(day, hour)) {
      this.snack.open(this.t('CALENDAR.ERROR_HOUR_BLOCKED'), this.t('COMMON.CLOSE'), { duration: 3500 });
      return;
    }

    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);

    const queryParams: Record<string, string> = {
      resourceId,
      date: this.toDateOnly(start),
    };

    if (bookingMode === BookingMode.DATETIME_RANGE) {
      queryParams['start'] = this.toDateTimeLocal(start);
      queryParams['end'] = this.toDateTimeLocal(end);
    }

    this.router.navigate(['/reservations/new'], { queryParams });
  }

  isDateBookable(date: Date): boolean {
    const rules = this.ws.workspaceSettings().operatingRules;
    const day = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    return rules.workingDays.includes(day) && !rules.blockedDays.includes(day);
  }

  isBlockedHourForDate(date: Date, hour: number): boolean {
    const rules = this.ws.workspaceSettings().operatingRules;
    const day = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    if (!rules.workingDays.includes(day)) return true;
    if (rules.blockedDays.includes(day)) return true;
    return rules.blockedHours.includes(hour);
  }

  private toDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toDateTimeLocal(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  toggleResource(id: string): void {
    this.selectedResourceIds.update((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  }

  isResourceSelected(id: string): boolean {
    const ids = this.selectedResourceIds();
    return !ids.length || ids.includes(id);
  }

  // ── Style helpers ─────────────────────────────────────────────────────────

  resourceTypeColor(type: ResourceType): string {
    const map: Record<ResourceType, string> = {
      [ResourceType.GUEST_HOUSE]:    'var(--sm-res-guest-house)',
      [ResourceType.CHALET]:         'var(--sm-res-chalet)',
      [ResourceType.FOOTBALL_FIELD]: 'var(--sm-res-football-field)',
      [ResourceType.MEETING_ROOM]:   'var(--sm-res-meeting-room)',
      [ResourceType.CAMP]:           'var(--sm-res-camp)',
      [ResourceType.EVENT_VENUE]:    'var(--sm-res-event-venue)',
    };
    return map[type] ?? '#94a3b8';
  }

  resourceTypeIcon(type: ResourceType): string {
    const icons: Record<ResourceType, string> = {
      [ResourceType.GUEST_HOUSE]:    'home',
      [ResourceType.CHALET]:         'cabin',
      [ResourceType.FOOTBALL_FIELD]: 'sports_soccer',
      [ResourceType.MEETING_ROOM]:   'meeting_room',
      [ResourceType.CAMP]:           'camping',
      [ResourceType.EVENT_VENUE]:    'celebration',
    };
    return icons[type] ?? 'hotel';
  }

  statusDot(status: ReservationStatus): string {
    const map: Record<ReservationStatus, string> = {
      [ReservationStatus.CONFIRMED]: 'var(--sm-confirmed)',
      [ReservationStatus.PENDING]:   'var(--sm-pending)',
      [ReservationStatus.COMPLETED]: '#059669',
      [ReservationStatus.CANCELLED]: 'var(--sm-cancelled)',
      [ReservationStatus.DELETED]:   '#9ca3af',
    };
    return map[status] ?? '#94a3b8';
  }

  dayOfMonth(date: Date): number      { return date.getDate(); }
  isWeekend(date: Date): boolean      { return date.getDay() === 0 || date.getDay() === 6; }
  isFirstOfMonth(date: Date): boolean { return date.getDate() === 1; }
  shortMonth(date: Date): string      { return date.toLocaleDateString(this.localeCode(), { month: 'short' }); }

  private localeCode(): string {
    return this.languageService.language() === 'ar' ? 'ar-LB' : 'en-US';
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }

  isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth() &&
           a.getDate()     === b.getDate();
  }

  private eventSpansDay(e: CalendarEvent, d: Date): boolean {
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Half-open overlap check: [checkIn, checkOut) vs [dayStart, dayEnd).
    // This makes checkout exclusive for nightly bookings.
    return e.checkIn < dayEnd && e.checkOut > dayStart;
  }

  private eventEndInclusive(e: CalendarEvent): Date {
    // Convert exclusive checkout boundary to the previous instant for day-column spans.
    return new Date(Math.max(e.checkIn.getTime(), e.checkOut.getTime() - 1));
  }

  private dayIndex(days: Date[], date: Date): number {
    const d   = new Date(date); d.setHours(0, 0, 0, 0);
    const idx = days.findIndex((day) => {
      const dd = new Date(day); dd.setHours(0, 0, 0, 0);
      return dd.getTime() === d.getTime();
    });
    return idx === -1 ? (d < days[0] ? -1 : days.length) : idx;
  }
}
