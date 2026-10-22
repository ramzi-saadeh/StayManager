import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { WorkspaceService } from '../../core/services/workspace.service';
import { Reservation } from '../../core/models/reservation.model';
import { PriceUnit, ReservationStatus, ResourceType } from '../../core/models/enums';
import { StatusBadgeComponent } from '../../ui/status-badge/status-badge.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDatepickerModule,
    TranslatePipe,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './reservations.component.html',
  styleUrl: './reservations.component.scss',
})
export class ReservationsComponent {
  private repo   = inject(ReservationRepository);
  private ws     = inject(WorkspaceService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private authService = inject(AuthService);
  private userRepo = inject(UserRepository);

  readonly ReservationStatus = ReservationStatus;
  readonly ResourceType      = ResourceType;

  // Active status filter — null means 'all'
  statusFilter = signal<ReservationStatus | null>(null);
  searchQuery  = signal('');

  statuses = [
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ];

  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );

  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');

  allReservations = toSignal(
    toObservable(this.ws.activeWorkspaceId).pipe(
      switchMap((wid) => (wid ? this.repo.list(wid) : of([]))),
    ),
    { initialValue: [] as Reservation[] },
  );

  filteredReservations = computed(() => {
    const all    = this.allReservations() ?? [];
    const status = this.statusFilter();
    const q      = this.searchQuery().toLowerCase();

    return all.filter((r) => {
      const matchStatus = !status || r.status === status;
      const matchSearch = !q ||
        r.customer.name.toLowerCase().includes(q) ||
        r.resourceName.toLowerCase().includes(q) ||
        (r.customer.phone ?? '').includes(q);
      return matchStatus && matchSearch;
    });
  });

  setStatus(s: ReservationStatus | null): void { this.statusFilter.set(s); }
  onSearch(e: Event): void {
    this.searchQuery.set((e.target as HTMLInputElement).value);
  }

  typeIcon(type: ResourceType): string {
    const map: Record<string, string> = {
      GUEST_HOUSE: 'house', CHALET: 'cabin', FOOTBALL_FIELD: 'sports_soccer',
      MEETING_ROOM: 'meeting_room', CAMP: 'camping', EVENT_VENUE: 'celebration',
    };
    return map[type] ?? 'place';
  }

  open(r: Reservation): void {
    this.router.navigate(['/reservations', r.reservationId]);
  }

  statusLabel(status: ReservationStatus): string {
    return this.t(`RESERVATIONS.STATUS_${status}`);
  }

  unitLabel(unit: PriceUnit): string {
    return this.t(`RESERVATIONS.UNIT_${unit}`);
  }

  emptyTitle(): string {
    const status = this.statusFilter();
    if (!status) {
      return this.t('RESERVATIONS.NO_RESERVATIONS_YET');
    }
    return this.t('RESERVATIONS.NO_STATUS_RESERVATIONS', {
      status: this.statusLabel(status).toLowerCase(),
    });
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
