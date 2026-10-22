import { Component, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserRepository } from '../../../core/services/user.repository';
import { ThemeService } from '../../../core/services/theme.service';
import { ThemeMode } from '../../../core/models/enums';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private auth     = inject(AuthService);
  private userRepo = inject(UserRepository);
  private theme    = inject(ThemeService);
  private snack    = inject(MatSnackBar);
  private fb       = inject(FormBuilder);
  private translate = inject(TranslateService);

  isSaving  = signal(false);
  isLoggingOut = signal(false);

  currentUser = this.auth.getCurrentUser();
  profile = toSignal(
    this.auth.user$.pipe(
      switchMap((user) => (user?.uid ? this.userRepo.get(user.uid) : of(undefined))),
    ),
    { initialValue: undefined },
  );

  readonly ThemeMode = ThemeMode;
  readonly themeOptions = this.theme.themes;

  form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email:       [{ value: '', disabled: true }],
    theme:       [ThemeMode.LIGHT, Validators.required],
  });

  constructor() {
    effect(() => {
      const profile = this.profile();
      const currentUser = this.auth.getCurrentUser();

      if (!currentUser) {
        return;
      }

      this.form.patchValue(
        {
          displayName: profile?.displayName ?? currentUser.displayName ?? '',
          email: profile?.email ?? currentUser.email ?? '',
          theme: profile?.theme ?? ThemeMode.LIGHT,
        },
        { emitEvent: false },
      );
    });
  }

  initials(): string {
    const name = this.auth.getCurrentUser()?.displayName;
    if (!name) return '?';
    return name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  async onSave(): Promise<void> {
    if (!this.form.valid) return;
    const uid = this.auth.getCurrentUser()?.uid;
    if (!uid) return;
    this.isSaving.set(true);
    try {
      const { displayName, theme } = this.form.getRawValue();
      await this.userRepo.update(uid, { displayName, theme });
      this.theme.applyTheme(theme);
      this.snack.open(this.t('PROFILE_SETTINGS.PROFILE_UPDATED'), this.t('COMMON.CLOSE'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('PROFILE_SETTINGS.ERROR_UPDATE_PROFILE'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async logout(): Promise<void> {
    this.isLoggingOut.set(true);
    try { await this.auth.logout(); } finally { this.isLoggingOut.set(false); }
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
