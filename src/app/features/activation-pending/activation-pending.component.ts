import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkspaceService } from '../../core/services/workspace.service';

@Component({
  selector: 'app-activation-pending',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  templateUrl: './activation-pending.component.html',
  styleUrl: './activation-pending.component.scss',
})
export class ActivationPendingComponent {
  private ws = inject(WorkspaceService);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private router = inject(Router);

  isSubmitting = signal(false);
  readonly whishNumber = '71901643';

  readonly workspace = computed(() => this.ws.workspace$());
  readonly workspaceId = computed(() => this.workspace()?.workspaceId ?? this.ws.activeWorkspaceId() ?? '');

  async onPaymentSent(): Promise<void> {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    try {
      await this.ws.markPaymentSubmitted(workspaceId);
      this.snack.open(
        this.t('ACTIVATION_PENDING.PAYMENT_SENT_SUCCESS'),
        this.t('COMMON.CLOSE'),
        { duration: 4200 },
      );
    } catch {
      this.snack.open(
        this.t('ACTIVATION_PENDING.PAYMENT_SENT_FAILED'),
        this.t('COMMON.CLOSE'),
        { duration: 5000 },
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async retryAccess(): Promise<void> {
    await this.router.navigate(['/dashboard']);
  }

  async copyWhishNumber(): Promise<void> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(this.whishNumber);
      }
      this.snack.open(
        this.t('ACTIVATION_PENDING.WHISH_COPIED'),
        this.t('COMMON.CLOSE'),
        { duration: 2600 },
      );
    } catch {
      this.snack.open(
        this.t('ACTIVATION_PENDING.WHISH_COPY_FAILED'),
        this.t('COMMON.CLOSE'),
        { duration: 4200 },
      );
    }
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }
}
