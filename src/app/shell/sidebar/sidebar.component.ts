import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { LanguageService } from '../../core/services/language.service';
import { WorkspaceService, WorkspaceSwitchItem } from '../../core/services/workspace.service';
import { WorkspacePlan, WorkspaceRole } from '../../core/models/enums';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';

interface NavItem {
  labelKey: string;
  icon: string;
  route: string;
  badge?: number;
}

interface NavGroup {
  headingKey?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatButtonModule,
    MatDividerModule,
    CommonModule,
    TranslatePipe,
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private languageService = inject(LanguageService);
  private workspaceService = inject(WorkspaceService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private authService = inject(AuthService);
  private userRepo = inject(UserRepository);

  collapsed = input(false);
  navItemClicked = output<void>();
  tooltipPosition = computed<'left' | 'right'>(() =>
    this.languageService.language() === 'ar' ? 'left' : 'right',
  );
  workspaceBrandName = computed(() => {
    const name = this.workspaceService.workspace$()?.name?.trim();
    return name || null;
  });
  workspaceBrandLogo = computed(() => this.workspaceService.workspaceBrandLogoUrl());
  readonly WorkspaceRole = WorkspaceRole;

  workspaces = toSignal(this.workspaceService.listAccessibleWorkspaces(), {
    initialValue: [] as WorkspaceSwitchItem[],
  });

  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );

  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');

  currentWorkspacePlan = computed(() => this.workspaceService.workspace$()?.plan ?? WorkspacePlan.FREE);
  ownedWorkspaceCount = computed(() =>
    this.workspaces().filter((item) => item.role === WorkspaceRole.OWNER).length,
  );
  maxWorkspacesForPlan = computed(() =>
    this.workspaceService.maxOwnedWorkspacesForPlan(this.currentWorkspacePlan()),
  );
  canCreateWorkspace = computed(() => {
    const plan = this.currentWorkspacePlan();
    const max = this.maxWorkspacesForPlan();
    if (plan === WorkspacePlan.FREE) return false;
    if (max == null) return true;
    return this.ownedWorkspaceCount() < max;
  });
  currentPlanLabelKey = computed(() => {
    const plan = this.currentWorkspacePlan();
    if (plan === WorkspacePlan.PRO) return 'SIDEBAR.PRO_PLAN';
    if (plan === WorkspacePlan.ENTERPRISE) return 'SIDEBAR.ENTERPRISE_PLAN';
    return 'SIDEBAR.FREE_PLAN';
  });

  readonly navGroups = computed<NavGroup[]>(() => {
    const sharedItems: NavItem[] = [
      { labelKey: 'SIDEBAR.DASHBOARD', icon: 'dashboard', route: '/dashboard' },

    ];

    if (this.isOwner()) {
      sharedItems.push({ labelKey: 'SIDEBAR.CALENDAR', icon: 'calendar_month', route: '/calendar' },);
    }


    const operationsItems: NavItem[] = [
      { labelKey: 'SIDEBAR.RESERVATIONS', icon: 'event_available', route: '/reservations' },
    ];

    if (this.isOwner()) {
      operationsItems.push({ labelKey: 'SIDEBAR.RESOURCES', icon: 'hotel', route: '/resources' });
    }

    const groups: NavGroup[] = [
      { items: sharedItems },
      { headingKey: 'SIDEBAR.OPERATIONS', items: operationsItems },
    ];

    if (this.isOwner()) {
      groups.push({
        headingKey: 'SIDEBAR.INSIGHTS',
        items: [
          { labelKey: 'SIDEBAR.FINANCE', icon: 'account_balance_wallet', route: '/finance' },
          { labelKey: 'SIDEBAR.REPORTS', icon: 'description', route: '/reports' },
        ],
      });
    }

    groups.push({
      headingKey: 'SIDEBAR.WORKSPACE',
      items: [{ labelKey: 'SIDEBAR.SETTINGS', icon: 'settings', route: '/settings' }],
    });

    return groups;
  });

  onNavClick() {
    this.navItemClicked.emit();
  }

  isActiveWorkspace(workspaceId: string): boolean {
    return this.workspaceService.activeWorkspaceId() === workspaceId;
  }

  selectWorkspace(workspaceId: string): void {
    if (this.isActiveWorkspace(workspaceId)) return;
    this.workspaceService.selectWorkspace(workspaceId);
    this.navItemClicked.emit();
  }

  async createWorkspace(): Promise<void> {
    if (!this.canCreateWorkspace()) {
      const plan = this.currentWorkspacePlan();
      if (plan === WorkspacePlan.FREE) {
        this.snack.open(
          this.t('SIDEBAR.CREATE_WORKSPACE_DISABLED_FREE'),
          this.t('COMMON.CLOSE'),
          { duration: 4500 },
        );
        return;
      }

      const max = this.maxWorkspacesForPlan() ?? 0;
      this.snack.open(
        this.t('SIDEBAR.CREATE_WORKSPACE_DISABLED_LIMIT', {
          max,
          current: this.ownedWorkspaceCount(),
        }),
        this.t('COMMON.CLOSE'),
        { duration: 4500 },
      );
      return;
    }

    await this.router.navigate(['/onboarding']);
    this.navItemClicked.emit();
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
