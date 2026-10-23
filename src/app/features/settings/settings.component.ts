import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, MatListModule, MatIconModule, TranslatePipe],
  template: `
    <div class="settings-layout">
      <nav class="settings-nav">
        <h2 class="nav-title">{{ 'SETTINGS_NAV.TITLE' | translate }}</h2>
        <mat-nav-list>
          @for (item of navItems(); track item.path) {
            <a mat-list-item
              [routerLink]="item.path"
              routerLinkActive="active-link"
              [routerLinkActiveOptions]="{exact: true}">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              {{ item.labelKey | translate }}
            </a>
          }
        </mat-nav-list>
      </nav>
      <div class="settings-content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [`
    .settings-layout {
      display: flex;
      min-height: 100%;
      background: var(--sm-page-bg);
    }
    .settings-nav {
      width: 232px;
      flex-shrink: 0;
      border-inline-end: 1px solid var(--sm-border);
      padding: var(--sm-sp-6) var(--sm-sp-3);
      background: var(--sm-surface-subtle);
    }
    .nav-title {
      font-size: var(--sm-text-xs);
      font-weight: 800;
      color: var(--sm-ink-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0 var(--sm-sp-3);
      margin: 0 0 var(--sm-sp-3);
    }
    .settings-content {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      margin: var(--sm-sp-5);
      border: 1px solid var(--sm-border);
      border-radius: var(--sm-r-md);
      background: var(--sm-surface);
      box-shadow: var(--sm-shadow-sm);
    }
    .settings-nav a { border-radius: var(--sm-r-sm); color: var(--sm-ink-secondary); }
    .settings-nav a:hover { background: var(--sm-surface-muted); }
    .active-link {
      background: var(--sm-primary-soft) !important;
      color: var(--sm-primary) !important;
      border-radius: var(--sm-r-sm);
    }

    :host-context([dir='rtl']) .settings-layout { direction: rtl; }

    @media (max-width: 640px) {
      .settings-layout { flex-direction: column; }
      .settings-nav {
        width: 100%;
        border-inline-end: 0;
        border-bottom: 1px solid var(--sm-border);
        padding: var(--sm-sp-3) var(--sm-sp-4);
      }
      .settings-content { margin: var(--sm-sp-3); }
      .nav-title { margin-bottom: var(--sm-sp-2); }
    }
  `],
})
export class SettingsComponent {
  private authService = inject(AuthService);
  private userRepo = inject(UserRepository);

  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );

  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');

  readonly navItems = computed(() => {
    const items = [{ path: '/settings/profile', icon: 'manage_accounts', labelKey: 'SETTINGS_NAV.PROFILE' }];

    if (this.isOwner()) {
      items.unshift({ path: '/settings/workspace', icon: 'business', labelKey: 'SETTINGS_NAV.WORKSPACE' });
      items.push({ path: '/settings/members', icon: 'group', labelKey: 'SETTINGS_NAV.MEMBERS' });
    }

    return items;
  });
}
