import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { WorkspaceService } from '../../core/services/workspace.service';
import { Workspace } from '../../core/models/workspace.model';

@Component({
  selector: 'app-super-admin-approvals',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './super-admin-approvals.component.html',
  styleUrl: './super-admin-approvals.component.scss',
})
export class SuperAdminApprovalsComponent {
  private ws = inject(WorkspaceService);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);

  readonly pending = toSignal(this.ws.listPendingApprovals(), { initialValue: [] as Workspace[] });
  approvingIds = signal<string[]>([]);

  readonly pendingCount = computed(() => this.pending().length);

  isApproving(workspaceId: string): boolean {
    return this.approvingIds().includes(workspaceId);
  }

  async approve(workspaceId: string): Promise<void> {
    if (!workspaceId || this.isApproving(workspaceId)) return;
    this.approvingIds.update((ids) => [...ids, workspaceId]);

    try {
      await this.ws.approveWorkspaceAccess(workspaceId);
      this.snack.open(this.t('SUPER_ADMIN_APPROVALS.APPROVED'), this.t('COMMON.CLOSE'), { duration: 3200 });
    } catch {
      this.snack.open(this.t('SUPER_ADMIN_APPROVALS.APPROVE_FAILED'), this.t('COMMON.CLOSE'), { duration: 4500 });
    } finally {
      this.approvingIds.update((ids) => ids.filter((id) => id !== workspaceId));
    }
  }

  submittedAt(value: unknown): string {
    if (value && typeof value === 'object' && 'toDate' in (value as object)) {
      const toDate = (value as { toDate?: () => Date }).toDate;
      if (typeof toDate === 'function') {
        return toDate.call(value as { toDate: () => Date }).toLocaleString();
      }
    }
    return '-';
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }
}
