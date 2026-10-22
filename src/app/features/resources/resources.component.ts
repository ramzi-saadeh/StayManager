import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { ResourceRepository } from '../../core/services/resource.repository';
import { AuthService } from '../../services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { Resource } from '../../core/models/resource.model';
import { ResourceType, BookingMode, WorkspacePlan } from '../../core/models/enums';
import { StatusBadgeComponent } from '../../ui/status-badge/status-badge.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './resources.component.html',
  styleUrl: './resources.component.scss',
})
export class ResourcesComponent {
  private repo      = inject(ResourceRepository);
  private ws        = inject(WorkspaceService);
  private auth      = inject(AuthService);
  private router    = inject(Router);
  private snack     = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private readonly FREE_RESOURCE_LIMIT = 1;

  readonly ResourceType = ResourceType;
  readonly BookingMode  = BookingMode;

  displayedColumns = ['type', 'name', 'bookingMode', 'price', 'status', 'actions'];

  resources = toSignal(
    toObservable(this.ws.activeWorkspaceId).pipe(
      switchMap((wid) => wid ? this.repo.listAll(wid) : []),
    ),
    { initialValue: null },
  );

  isNewResourceDisabled = computed(() => {
    const items = this.resources();
    if (!items) {
      return false;
    }

    return this.isFreePlan() && items.length >= this.FREE_RESOURCE_LIMIT;
  });

  typeIcon(type: ResourceType): string {
    const map: Record<ResourceType, string> = {
      [ResourceType.GUEST_HOUSE]:    'house',
      [ResourceType.CHALET]:         'cabin',
      [ResourceType.FOOTBALL_FIELD]: 'sports_soccer',
      [ResourceType.MEETING_ROOM]:   'meeting_room',
      [ResourceType.CAMP]:           'camping',
      [ResourceType.EVENT_VENUE]:    'celebration',
    };
    return map[type] ?? 'place';
  }

  typeLabel(type: ResourceType): string {
    return this.t(`RESOURCES.TYPE_${type}`);
  }

  priceLabel(r: Resource): string {
    const unit = this.t(`RESOURCES.UNIT_${r.priceUnit}`);
    return `${r.basePrice} ${unit}`;
  }

  async toggleActive(r: Resource): Promise<void> {
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) return;
    try {
      if (r.isActive) {
        await this.repo.deactivate(wid, r.resourceId, uid);
      } else {
        await this.repo.activate(wid, r.resourceId, uid);
      }
    } catch {
      this.snack.open(this.t('RESOURCES.ERROR_UPDATE_STATUS'), this.t('COMMON.CLOSE'), { duration: 4000 });
    }
  }

  edit(r: Resource): void {
    this.router.navigate(['/resources', r.resourceId, 'edit']);
  }

  onNewResource(): void {
    if (this.isNewResourceDisabled()) {
      this.showUpgradeHint();
      return;
    }

    this.router.navigate(['/resources/new']);
  }

  showUpgradeHint(): void {
    this.snack.open(
      this.t('RESOURCES.FREE_LIMIT_REACHED_HINT'),
      this.t('RESOURCES.UPGRADE_CTA'),
      { duration: 5500 },
    );
  }

  private isFreePlan(): boolean {
    const raw = String(this.ws.workspace$()?.plan ?? '').trim().toUpperCase();
    return raw === WorkspacePlan.FREE;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
