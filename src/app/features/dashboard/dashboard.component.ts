import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map, combineLatestWith } from 'rxjs/operators';
import { of, combineLatest } from 'rxjs';
import { StatCardComponent } from '../../ui/stat-card/stat-card.component';
import { StatusBadgeComponent } from '../../ui/status-badge/status-badge.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { ResourceRepository } from '../../core/services/resource.repository';
import { WorkspaceService } from '../../core/services/workspace.service';
import { LanguageService } from '../../core/services/language.service';
import { Reservation } from '../../core/models/reservation.model';
import { Resource } from '../../core/models/resource.model';
import { ReservationStatus, ResourceType } from '../../core/models/enums';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    CommonModule,
    TranslatePipe,
    StatCardComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private reservationRepo = inject(ReservationRepository);
  private resourceRepo    = inject(ResourceRepository);
  private ws              = inject(WorkspaceService);
  private translate       = inject(TranslateService);
  private authService     = inject(AuthService);
  private userRepo        = inject(UserRepository);
  readonly languageService = inject(LanguageService);

  today          = new Date();

  get greetingPeriod(): string {
    this.languageService.language();
    return this.getGreetingPeriod();
  }

  private todayStr = this.today.toISOString().split('T')[0]; // YYYY-MM-DD

  // ── Raw Firestore streams ────────────────────────────────────────────────

  private wid$ = toObservable(this.ws.activeWorkspaceId);

  private allReservations = toSignal(
    this.wid$.pipe(
      switchMap((wid) => wid ? this.reservationRepo.list(wid) : of([])),
    ),
    { initialValue: [] as Reservation[] },
  );

  private allResources = toSignal(
    this.wid$.pipe(
      switchMap((wid) => wid ? this.resourceRepo.listAll(wid) : of([])),
    ),
    { initialValue: [] as Resource[] },
  );

  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );

  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');

  hasNoResources = computed(() => this.isOwner() && this.allResources().length === 0);

  // ── Upcoming reservations (today onwards, PENDING + CONFIRMED) ───────────

  upcomingReservations = computed(() =>
    this.allReservations()
      .filter((r) =>
        (r.status === ReservationStatus.PENDING || r.status === ReservationStatus.CONFIRMED) &&
        !!r.startDate && r.startDate >= this.todayStr,
      )
      .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
      .slice(0, 8),
  );

  // ── KPI stats ────────────────────────────────────────────────────────────

  stats = computed(() => {
    if (!this.isOwner()) {
      return [];
    }

    this.languageService.language();
    const all = this.allReservations();

    const todayCheckins = all.filter(
      (r) => r.startDate === this.todayStr &&
             (r.status === ReservationStatus.CONFIRMED || r.status === ReservationStatus.PENDING),
    ).length;

    const todayCheckouts = all.filter(
      (r) => r.endDate === this.todayStr &&
             (r.status === ReservationStatus.CONFIRMED || r.status === ReservationStatus.COMPLETED),
    ).length;

    const activeStays = all.filter(
      (r) => r.status === ReservationStatus.CONFIRMED &&
             !!r.startDate && !!r.endDate &&
             r.startDate <= this.todayStr && r.endDate > this.todayStr,
    ).length;

    const monthStart = this.todayStr.substring(0, 7) + '-01';
    const revenueMtd = all
      .filter(
        (r) => r.status !== ReservationStatus.CANCELLED &&
               r.status !== ReservationStatus.DELETED &&
               !!r.startDate && r.startDate >= monthStart,
      )
      .reduce((sum, r) => sum + (r.price?.amount ?? 0), 0);

    return [
      {
        label:     this.t('DASHBOARD.STAT_CHECKINS'),
        value:     todayCheckins,
        icon:      'login',
        accent:    'primary' as const,
        trend:     null,
        trendLabel: '',
      },
      {
        label:     this.t('DASHBOARD.STAT_ACTIVE_STAYS'),
        value:     activeStays,
        icon:      'hotel',
        accent:    'success' as const,
        trend:     null,
        trendLabel: '',
      },
      {
        label:     this.t('DASHBOARD.STAT_CHECKOUTS'),
        value:     todayCheckouts,
        icon:      'logout',
        accent:    'warning' as const,
        trend:     null,
        trendLabel: '',
      },
      {
        label:     this.t('DASHBOARD.STAT_REVENUE_MTD'),
        value:     `${this.ws.currency()} ${revenueMtd.toLocaleString()}`,
        icon:      'payments',
        accent:    'neutral' as const,
        trend:     null,
        trendLabel: '',
      },
    ];
  });

  // ── Resource utilization ─────────────────────────────────────────────────

  resourceUtilization = computed(() => {
    const resources    = this.allResources();
    const reservations = this.allReservations();
    const monthStart   = this.todayStr.substring(0, 7) + '-01';
    const monthEnd     = this.todayStr.substring(0, 7) + '-31';
    const daysInMonth  = new Date(
      parseInt(this.todayStr.substring(0, 4)),
      parseInt(this.todayStr.substring(5, 7)),
      0,
    ).getDate();

    return resources.slice(0, 6).map((r) => {
      const resBookings = reservations.filter(
        (res) =>
          res.resourceId === r.resourceId &&
          res.status !== ReservationStatus.CANCELLED &&
          res.status !== ReservationStatus.DELETED &&
          !!res.startDate && res.startDate >= monthStart,
      );

      const bookedDays = resBookings.reduce((sum, res) => {
        if (!res.startDate || !res.endDate) return sum + 1;
        const s = new Date(res.startDate).getTime();
        const e = new Date(res.endDate).getTime();
        return sum + Math.max(1, Math.round((e - s) / 86400000));
      }, 0);

      const occupancyRate = Math.min(100, Math.round((bookedDays / daysInMonth) * 100));

      const nextRes = reservations
        .filter(
          (res) =>
            res.resourceId === r.resourceId &&
            (res.status === ReservationStatus.PENDING || res.status === ReservationStatus.CONFIRMED) &&
            !!res.startDate && res.startDate > this.todayStr,
        )
        .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0];

      // Find next available date after current/upcoming bookings
      const activeNow = reservations.find(
        (res) =>
          res.resourceId === r.resourceId &&
          (res.status === ReservationStatus.PENDING || res.status === ReservationStatus.CONFIRMED) &&
          !!res.startDate && !!res.endDate &&
          res.startDate <= this.todayStr && res.endDate > this.todayStr,
      );

      let nextAvailable: Date | null = null;
      if (!activeNow) {
        nextAvailable = this.today;
      } else if (activeNow.endDate) {
        nextAvailable = new Date(activeNow.endDate);
      }

      return {
        resourceId:    r.resourceId,
        name:          r.name,
        type:          r.type,
        occupancyRate,
        totalBookings: resBookings.length,
        nextAvailable,
      };
    });
  });

  // ── Template helpers ─────────────────────────────────────────────────────

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

  resourceTypeColor(type: ResourceType): string {
    const colors: Record<ResourceType, string> = {
      [ResourceType.GUEST_HOUSE]:    'var(--sm-res-guest-house)',
      [ResourceType.CHALET]:         'var(--sm-res-chalet)',
      [ResourceType.FOOTBALL_FIELD]: 'var(--sm-res-football-field)',
      [ResourceType.MEETING_ROOM]:   'var(--sm-res-meeting-room)',
      [ResourceType.CAMP]:           'var(--sm-res-camp)',
      [ResourceType.EVENT_VENUE]:    'var(--sm-res-event-venue)',
    };
    return colors[type] ?? '#94a3b8';
  }

  nights(r: Reservation): number {
    if (!r.startDate || !r.endDate) return 0;
    const diff = new Date(r.endDate).getTime() - new Date(r.startDate).getTime();
    return Math.max(0, Math.round(diff / 86400000));
  }

  isToday(date: Date | string | null): boolean {
    if (!date) return false;
    const d = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return d === this.todayStr;
  }

  isTomorrow(date: Date | string | null): boolean {
    if (!date) return false;
    const tomorrow = new Date(this.today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tStr = tomorrow.toISOString().split('T')[0];
    const d    = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return d === tStr;
  }

  dateLabel(date: Date | string | null): string {
    if (!date) return '';
    if (this.isToday(date))    return this.t('DASHBOARD.TODAY');
    if (this.isTomorrow(date)) return this.t('DASHBOARD.TOMORROW');
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(this.localeCode(), { month: 'short', day: 'numeric' });
  }

  private getGreetingPeriod(): string {
    const h = new Date().getHours();
    if (h < 12) return this.t('DASHBOARD.GREETING_MORNING');
    if (h < 17) return this.t('DASHBOARD.GREETING_AFTERNOON');
    return this.t('DASHBOARD.GREETING_EVENING');
  }

  nightsLabel(count: number): string {
    return this.t(count === 1 ? 'DASHBOARD.NIGHT_SINGULAR' : 'DASHBOARD.NIGHT_PLURAL', { count });
  }

  private localeCode(): string {
    return this.languageService.language() === 'ar' ? 'ar-LB' : 'en-US';
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
