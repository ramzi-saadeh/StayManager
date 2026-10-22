import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { firstValueFrom, of } from 'rxjs';
import { ReservationRepository } from '../../../core/services/reservation.repository';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../services/auth.service';
import { Reservation } from '../../../core/models/reservation.model';
import { RecurrenceRule } from '../../../core/models/recurrence.model';
import { PaymentStatus, ReservationStatus, ResourceType } from '../../../core/models/enums';
import { selectSeriesTargets } from '../../../core/utils/recurrence';
import { StatusBadgeComponent } from '../../../ui/status-badge/status-badge.component';
import {
  ReservationEditDialogComponent,
  ReservationEditDialogData,
  ReservationEditDialogResult,
} from '../series-dialogs/reservation-edit-dialog.component';
import {
  SeriesCancelDialogComponent,
  SeriesCancelDialogData,
  SeriesCancelDialogResult,
} from '../series-dialogs/series-cancel-dialog.component';

@Component({
  selector: 'app-reservation-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
    StatusBadgeComponent,
  ],
  templateUrl: './reservation-detail.component.html',
  styleUrl: './reservation-detail.component.scss',
})
export class ReservationDetailComponent {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private repo   = inject(ReservationRepository);
  private ws     = inject(WorkspaceService);
  private auth   = inject(AuthService);
  private snack  = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);

  readonly ReservationStatus = ReservationStatus;
  readonly PaymentStatus = PaymentStatus;

  actionLoading = signal<string | null>(null);

  reservation = toSignal(
    this.route.paramMap.pipe(
      switchMap((pm) => {
        const wid = this.ws.activeWorkspaceId();
        const id  = pm.get('id');
        if (!wid || !id) return of(null);
        return this.repo.get(wid, id);
      }),
    ),
    { initialValue: null as Reservation | null },
  );

  canConfirm  = computed(() => this.reservation()?.status === ReservationStatus.PENDING);
  canComplete = computed(() => this.reservation()?.status === ReservationStatus.CONFIRMED);
  canCancel   = computed(() => {
    const s = this.reservation()?.status;
    return s === ReservationStatus.PENDING || s === ReservationStatus.CONFIRMED;
  });
  canDelete   = computed(() => {
    const s = this.reservation()?.status;
    return s === ReservationStatus.CANCELLED || s === ReservationStatus.COMPLETED;
  });

  canMarkPaid = computed(() => this.reservation()?.paymentStatus !== PaymentStatus.PAID);
  canMarkUnpaid = computed(() => this.reservation()?.paymentStatus === PaymentStatus.PAID);

  /** Only active bookings that have not ended can be edited. */
  canEdit = computed(() => {
    const r = this.reservation();
    return !!r && this.isActive(r) && r.end.toMillis() > Date.now();
  });

  series = toSignal(
    toObservable(this.reservation).pipe(
      map((r) => r?.seriesId ?? null),
      distinctUntilChanged(),
      switchMap((seriesId) => {
        const wid = this.ws.activeWorkspaceId();
        return wid && seriesId ? this.repo.listSeries(wid, seriesId) : of([] as Reservation[]);
      }),
    ),
    { initialValue: [] as Reservation[] },
  );

  /** Bookings an edit or cancel with SERIES scope would touch, including this one. */
  upcomingInSeries = computed(() => {
    const r = this.reservation();
    return r ? selectSeriesTargets(this.series(), r.reservationId, Date.now()).length : 0;
  });

  private isActive(r: Reservation): boolean {
    return r.status === ReservationStatus.PENDING || r.status === ReservationStatus.CONFIRMED;
  }

  typeIcon(type: ResourceType): string {
    const map: Record<string, string> = {
      GUEST_HOUSE: 'house', CHALET: 'cabin', FOOTBALL_FIELD: 'sports_soccer',
      MEETING_ROOM: 'meeting_room', CAMP: 'camping', EVENT_VENUE: 'celebration',
    };
    return map[type] ?? 'place';
  }

  private async doAction(name: string, fn: () => Promise<any>): Promise<boolean> {
    this.actionLoading.set(name);
    try {
      const res = await fn();
      if (res && res.success === false) {
        this.snack.open(res.message ?? this.t('RESERVATION_DETAIL.ERROR_ACTION', { action: this.actionLabel(name).toLowerCase() }), this.t('COMMON.CLOSE'), { duration: 5000 });
        return false;
      }
      return true;
    } catch {
      this.snack.open(this.t('RESERVATION_DETAIL.ERROR_COULD_NOT_ACTION', { action: this.actionLabel(name).toLowerCase() }), this.t('COMMON.CLOSE'), { duration: 5000 });
      return false;
    } finally {
      this.actionLoading.set(null);
    }
  }

  async confirm(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    const wid = this.ws.activeWorkspaceId()!;
    await this.doAction('confirm', () => this.repo.confirm(wid, r.reservationId));
  }

  async complete(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    const wid = this.ws.activeWorkspaceId()!;
    await this.doAction('complete', () => this.repo.complete(wid, r.reservationId));
  }

  async cancel(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    const wid = this.ws.activeWorkspaceId()!;

    if (r.seriesId) {
      const result = await firstValueFrom(
        this.dialog
          .open<SeriesCancelDialogComponent, SeriesCancelDialogData, SeriesCancelDialogResult>(
            SeriesCancelDialogComponent,
            { data: { upcomingInSeries: this.upcomingInSeries() } },
          )
          .afterClosed(),
      );
      if (!result) return;
      await this.doAction('cancel', () =>
        this.repo.cancelWithScope(wid, r, result.scope, result.reason || undefined),
      );
      return;
    }

    const reason = prompt(this.t('RESERVATION_DETAIL.CANCELLATION_REASON_OPTIONAL')) ?? '';
    await this.doAction('cancel', () => this.repo.cancel(wid, r.reservationId, reason || undefined));
  }

  async edit(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    const wid = this.ws.activeWorkspaceId()!;

    const result = await firstValueFrom(
      this.dialog
        .open<ReservationEditDialogComponent, ReservationEditDialogData, ReservationEditDialogResult>(
          ReservationEditDialogComponent,
          { data: { reservation: r, upcomingInSeries: this.upcomingInSeries() } },
        )
        .afterClosed(),
    );
    if (!result) return;

    const saved = await this.doAction('edit', () =>
      this.repo.updateDetails(wid, r, result.changes, result.scope),
    );
    if (saved) this.snack.open(this.t('RESERVATION_SERIES.SAVED'), this.t('COMMON.CLOSE'), { duration: 3000 });
  }

  ruleSummary(rule: RecurrenceRule | null | undefined): string {
    return rule ? this.t(`RESERVATION_SERIES.RULE_${rule.frequency}`, { count: rule.interval }) : '';
  }

  async softDelete(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    if (!confirm(this.t('RESERVATION_DETAIL.CONFIRM_SOFT_DELETE'))) return;
    const reason = prompt(this.t('RESERVATION_DETAIL.DELETION_REASON')) ?? '';
    const wid = this.ws.activeWorkspaceId()!;
    await this.doAction('delete', async () => {
      const res = await this.repo.delete(wid, r.reservationId, reason || this.t('RESERVATION_DETAIL.ADMIN_DELETE'));
      if (res.success) this.router.navigate(['/reservations']);
      return res;
    });
  }

  async markPaid(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    const wid = this.ws.activeWorkspaceId()!;
    await this.doAction('mark payment as paid', () => this.repo.updatePaymentStatus(wid, r.reservationId, PaymentStatus.PAID));
  }

  async markUnpaid(): Promise<void> {
    const r = this.reservation(); if (!r) return;
    const wid = this.ws.activeWorkspaceId()!;
    await this.doAction('mark payment as unpaid', () => this.repo.updatePaymentStatus(wid, r.reservationId, PaymentStatus.UNPAID));
  }

  unitLabel(unit: string): string {
    return this.t(`RESERVATIONS.UNIT_${unit}`);
  }

  actionLabel(action: string): string {
    const key = action.toUpperCase().replaceAll(' ', '_').replaceAll('-', '_');
    return this.t(`RESERVATION_DETAIL.ACTION_${key}`);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
