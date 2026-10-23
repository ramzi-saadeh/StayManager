import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { Reservation } from '../../core/models/reservation.model';
import { StatusBadgeComponent } from '../../ui/status-badge/status-badge.component';
import { REQUIRE_EMAIL_VERIFICATION } from '../../core/auth-policy';

@Component({
  selector: 'app-customer-reservations',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    StatusBadgeComponent,
  ],
  templateUrl: './customer-reservations.component.html',
  styleUrl: './customer-reservations.component.scss',
})
export class CustomerReservationsComponent {
  readonly emailVerificationRequired = REQUIRE_EMAIL_VERIFICATION;
  private readonly auth = inject(AuthService);
  private readonly reservationsRepo = inject(ReservationRepository);
  readonly loadFailed = signal(false);
  readonly verificationSending = signal(false);
  readonly verificationSent = signal(false);
  readonly verificationSendFailed = signal(false);
  readonly currentUser = toSignal(this.auth.user$, { initialValue: null });

  readonly reservations = toSignal(
    this.auth.user$.pipe(
      switchMap((user) => {
        this.loadFailed.set(false);
        if (!user) return of([] as Reservation[]);
        return this.reservationsRepo.listForCustomer(user.uid, user.email, user.emailVerified).pipe(
          catchError((error) => {
            console.error('Could not load customer reservations.', error);
            this.loadFailed.set(true);
            return of([] as Reservation[]);
          }),
        );
      }),
      startWith(null as Reservation[] | null),
    ),
    { initialValue: null },
  );

  async resendVerificationEmail(): Promise<void> {
    if (!REQUIRE_EMAIL_VERIFICATION || this.verificationSending()) return;
    this.verificationSending.set(true);
    this.verificationSendFailed.set(false);
    try {
      await this.auth.sendVerificationEmail();
      this.verificationSent.set(true);
    } catch (error) {
      console.error('Could not send customer email verification.', error);
      this.verificationSendFailed.set(true);
    } finally {
      this.verificationSending.set(false);
    }
  }
}