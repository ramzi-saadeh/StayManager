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
    .settings-layout { display: flex; height: 100%; }
    .settings-nav {
      width: 220px; flex-shrink: 0;
      border-inline-end: 1px solid #f1f5f9;
      padding: 24px 0;
    }
    .nav-title {
      font-size: 11px; font-weight: 700; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.08em;
      padding: 0 16px; margin: 0 0 8px;
    }
    .settings-content { flex: 1; overflow: auto; }
    .active-link { background: #eff6ff !important; color: #2563eb !important; border-radius: 8px; }

    :host-context([dir='rtl']) .settings-layout { direction: rtl; }
    :host-context([dir='rtl']) .settings-nav { border-inline-end: none; border-inline-start: 1px solid #f1f5f9; }

    @media (max-width: 640px) {
      .settings-layout { flex-direction: column; }
      .settings-nav { width: 100%; border-inline-start: none; border-inline-end: none; border-bottom: 1px solid #f1f5f9; padding: 12px 0; }
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
