import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnDestroy, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { ReservationRepository } from '../../../core/services/reservation.repository';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { LanguageService } from '../../../core/services/language.service';

@Component({
  selector: 'app-reservation-receipt',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './reservation-receipt.component.html',
  styleUrl: './reservation-receipt.component.scss',
})
export class ReservationReceiptComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private repo = inject(ReservationRepository);
  private ws = inject(WorkspaceService);
  private translate = inject(TranslateService);
  private document = inject(DOCUMENT);
  readonly languageService = inject(LanguageService);

  constructor() {
    this.document.body.classList.add('receipt-print-mode');
  }

  reservation = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => {
        const workspaceId = this.ws.activeWorkspaceId();
        const reservationId = params.get('id');
        if (!workspaceId || !reservationId) {
          return of(null);
        }
        return this.repo.get(workspaceId, reservationId);
      }),
    ),
    { initialValue: null },
  );

  readonly workspace = this.ws.workspace$;

  receiptNumber = computed(() => {
    const reservation = this.reservation();
    if (!reservation) {
      return '-';
    }

    const created = reservation.createdAt?.toDate?.();
    const datePart = created
      ? `${created.getFullYear()}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}`
      : 'NA';

    return `SM-${datePart}-${reservation.reservationId.slice(0, 6).toUpperCase()}`;
  });

  printReceipt(): void {
    window.print();
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('receipt-print-mode');
  }

  localeCode(): string {
    return this.languageService.language() === 'ar' ? 'ar-LB' : 'en-US';
  }

  paymentStatusLabel(status: string | null | undefined): string {
    const normalized = String(status ?? 'UNPAID').toUpperCase();
    const keyMap: Record<string, string> = {
      UNPAID: 'RESERVATION_RECEIPT.PAYMENT_STATUS_UNPAID',
      PAID: 'RESERVATION_RECEIPT.PAYMENT_STATUS_PAID',
      PARTIAL: 'RESERVATION_RECEIPT.PAYMENT_STATUS_PARTIAL',
    };

    return this.t(keyMap[normalized] ?? keyMap['UNPAID']);
  }

  reservationStatusLabel(status: string | null | undefined): string {
    return this.t(`RESERVATIONS.STATUS_${status ?? 'PENDING'}`);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
