import { DOCUMENT } from '@angular/common';
import { Injectable, inject, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { ThemeMode } from '../models/enums';
import { UserRepository } from './user.repository';
import { WorkspaceService } from './workspace.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private auth = inject(AuthService);
  private userRepo = inject(UserRepository);
  private workspace = inject(WorkspaceService);
  private document = inject(DOCUMENT);

  private readonly storageKey = 'sm_theme_mode';

  private themePreference = toSignal(
    this.auth.user$.pipe(
      switchMap((user) => {
        if (!user?.uid) {
          return of(this.readStoredTheme());
        }

        return this.userRepo.get(user.uid).pipe(
          map((profile) => profile?.theme ?? this.readStoredTheme()),
        );
      }),
      distinctUntilChanged(),
    ),
    { initialValue: this.readStoredTheme() },
  );

  constructor() {
    effect(() => {
      const workspaceTheme = this.workspace.workspaceTheme();
      this.applyTheme(workspaceTheme ?? this.themePreference());
    });
  }

  readonly themes = [
    { value: ThemeMode.LIGHT, label: 'Light' },
    { value: ThemeMode.MIDNIGHT, label: 'Midnight' },
    { value: ThemeMode.FOREST, label: 'Forest' },
  ] as const;

  applyTheme(theme: ThemeMode): void {
    const normalized = this.normalizeTheme(theme);
    this.document.documentElement.dataset['smTheme'] = normalized.toLowerCase();
    this.document.documentElement.style.colorScheme = normalized === ThemeMode.MIDNIGHT ? 'dark' : 'light';
    localStorage.setItem(this.storageKey, normalized);
  }

  readStoredTheme(): ThemeMode {
    return this.normalizeTheme(localStorage.getItem(this.storageKey) as ThemeMode | null);
  }

  private normalizeTheme(theme: ThemeMode | string | null | undefined): ThemeMode {
    if (theme === ThemeMode.MIDNIGHT || theme === ThemeMode.FOREST || theme === ThemeMode.LIGHT) {
      return theme;
    }
    return ThemeMode.LIGHT;
  }
}