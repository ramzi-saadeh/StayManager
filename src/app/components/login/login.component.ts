import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AccountRole } from '../../core/models/user.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatSnackBarModule,
    MatDividerModule,
    TranslatePipe,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  private fb          = inject(FormBuilder);
  private authService = inject(AuthService);
  private userRepo    = inject(UserRepository);
  private workspace   = inject(WorkspaceService);
  private router      = inject(Router);
  private snackBar    = inject(MatSnackBar);
  private translate   = inject(TranslateService);

  isLoading    = signal(false);
  hidePassword = signal(true);
  activeTab    = signal<'login' | 'register'>('login');
  accountRole  = signal<AccountRole>('customer');

  loginForm = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  registerForm = this.fb.nonNullable.group({
    name:     ['', [Validators.required, Validators.minLength(2)]],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  async onLogin(): Promise<void> {
    if (!this.loginForm.valid) return;
    this.isLoading.set(true);
    try {
      const { email, password } = this.loginForm.getRawValue();
      this.workspace.clearActiveWorkspace();
      await this.authService.loginWithEmail(email, password);
      await this.redirectAfterAuth();
    } catch {
      this.snackBar.open(this.t('LOGIN_PAGE.ERROR_INVALID_LOGIN'), this.t('COMMON.CLOSE'), { duration: 4000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister(): Promise<void> {
    if (!this.registerForm.valid) return;
    const values = this.registerForm.getRawValue();
    if (values.password !== values.confirmPassword) {
      this.snackBar.open(this.t('LOGIN_PAGE.ERROR_PASSWORD_MISMATCH'), this.t('COMMON.CLOSE'), { duration: 5000 });
      return;
    }
    this.isLoading.set(true);
    try {
      const { email, password, name } = values;
      const selectedRole = this.accountRole();
      this.workspace.clearActiveWorkspace();
      await this.authService.registerWithEmail(email, password, name);
      const uid = this.authService.getCurrentUser()!.uid;
      await this.userRepo.upsert(uid, {
        displayName: name,
        email,
        photoUrl: null,
        role: selectedRole,
      });

      await this.redirectAfterAuth();
    } catch (err: any) {
      const msg = err?.code === 'auth/email-already-in-use'
        ? this.t('LOGIN_PAGE.ERROR_EMAIL_IN_USE')
        : this.t('LOGIN_PAGE.ERROR_REGISTER_FAILED');
      this.snackBar.open(msg, this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  continueWithGoogle(): void {
    this.snackBar.open(this.t('LOGIN_PAGE.GOOGLE_COMING_SOON'), this.t('COMMON.YES'), {
      duration: 4500,
    });
  }

  /**
    * Redirect based on the user's account role:
   * - owners go to dashboard, where the workspace guard can route to onboarding if needed
   * - customers go to the public home so they can browse public workspaces
   */
  private async redirectAfterAuth(): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user) {
      await this.router.navigate(['/']);
      return;
    }

    const profile = await firstValueFrom(this.userRepo.get(user.uid).pipe(take(1)));
    const target = profile?.role === 'owner' ? ['/dashboard'] : ['/my-reservations'];
    await this.router.navigate(target);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}

