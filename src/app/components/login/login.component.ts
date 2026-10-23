import { Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { REQUIRE_EMAIL_VERIFICATION } from '../../core/auth-policy';

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
    MatCheckboxModule,
    TranslatePipe,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  private fb          = inject(FormBuilder);
  private authService = inject(AuthService);
  private userRepo    = inject(UserRepository);
  private workspace   = inject(WorkspaceService);
  private router      = inject(Router);
  private snackBar    = inject(MatSnackBar);
  private translate   = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private timers: ReturnType<typeof setTimeout>[] = [];

  isLoading    = signal(false);
  hidePassword = signal(true);
  activeTab    = signal<'login' | 'register'>('login');
  accountRole  = signal<AccountRole>('customer');
  showReset = signal(false);
  showGoogleCompletion = signal(false);
  readonly emailVerificationRequired = REQUIRE_EMAIL_VERIFICATION;
  showVerification = signal(REQUIRE_EMAIL_VERIFICATION && this.route.snapshot.queryParamMap.get('verify') === '1');
  verificationBusy = signal(false);
  verificationCooldown = signal(false);
  currentUser = toSignal(this.authService.user$, { initialValue: null });
  resetForm = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.timers.forEach((timer) => clearTimeout(timer));
    });
  }

  loginForm = this.fb.nonNullable.group({
    rememberMe: [false],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  registerForm = this.fb.nonNullable.group({
    name:     ['', [Validators.required, Validators.minLength(2)]],
    email:    ['', [Validators.required, Validators.email]],
    phone:    ['', [Validators.required, Validators.pattern(/^\+[1-9]\d{7,14}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(8)]],
    customerSearchConsent: [true],
  });

  googleProfileForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+[1-9]\d{7,14}$/)]],
    customerSearchConsent: [false],
  });

  async ngOnInit(): Promise<void> {
    if (this.route.snapshot.queryParamMap.get('complete') !== '1') return;
    this.isLoading.set(true);
    try {
      await firstValueFrom(this.authService.user$.pipe(take(1)));
      if (this.authService.getCurrentUser()) await this.redirectAfterAuth();
    } catch {
      this.snackBar.open(this.t('LOGIN_PAGE.ERROR_GOOGLE'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async onLogin(): Promise<void> {
    if (!this.loginForm.valid) return;
    this.isLoading.set(true);
    try {
      const { email, password, rememberMe } = this.loginForm.getRawValue();
      this.workspace.clearActiveWorkspace();
      await this.authService.loginWithEmail(email, password, rememberMe);
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
      const { email, password, name, phone, customerSearchConsent } = values;
      const selectedRole = this.accountRole();
      this.workspace.clearActiveWorkspace();
      await this.authService.registerWithEmail(email, password, name, phone, selectedRole, customerSearchConsent);
      if (REQUIRE_EMAIL_VERIFICATION) {
        this.showVerification.set(true);
        await this.resendVerification();
      }
      await this.redirectAfterAuth();
    } catch (err: any) {
      const msg = err?.details?.code === 'PHONE_IN_USE'
        ? this.t('LOGIN_PAGE.ERROR_PHONE_IN_USE')
        : err?.code === 'auth/email-already-in-use' || err?.details?.code === 'EMAIL_IN_USE'
        ? this.t('LOGIN_PAGE.ERROR_EMAIL_IN_USE')
        : this.t('LOGIN_PAGE.ERROR_REGISTER_FAILED');
      this.snackBar.open(msg, this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    if (this.resetForm.invalid || this.isLoading()) return;
    this.isLoading.set(true);
    try {
      await this.authService.requestPasswordReset(this.resetForm.controls.email.value);
      this.snackBar.open(this.t('LOGIN_PAGE.RESET_SENT'), this.t('COMMON.CLOSE'), { duration: 7000 });
      this.showReset.set(false);
    } catch {
      this.snackBar.open(this.t('LOGIN_PAGE.ERROR_RESET'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async resendVerification(): Promise<void> {
    if (!REQUIRE_EMAIL_VERIFICATION || this.verificationBusy() || this.verificationCooldown()) return;
    this.verificationBusy.set(true);
    try {
      await this.authService.sendVerificationEmail();
      this.verificationCooldown.set(true);
      this.timers.push(setTimeout(() => this.verificationCooldown.set(false), 60_000));
      this.snackBar.open(this.t('LOGIN_PAGE.VERIFICATION_SENT'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } catch {
      this.snackBar.open(this.t('LOGIN_PAGE.ERROR_VERIFICATION'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.verificationBusy.set(false);
    }
  }

  async checkVerification(): Promise<void> {
    if (this.verificationBusy()) return;
    this.verificationBusy.set(true);
    try {
      if (await this.authService.refreshCurrentUser()) await this.redirectAfterAuth();
      else this.snackBar.open(this.t('LOGIN_PAGE.EMAIL_NOT_VERIFIED'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } catch {
      this.snackBar.open(this.t('LOGIN_PAGE.ERROR_VERIFICATION'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.verificationBusy.set(false);
    }
  }

  async signOutVerification(): Promise<void> {
    await this.authService.logout();
    this.showVerification.set(false);
    await this.router.navigate(['/login']);
  }

  async continueWithGoogle(): Promise<void> {
    if (this.isLoading()) return;
    this.isLoading.set(true);
    try {
      await this.authService.loginWithGoogle(this.loginForm.controls.rememberMe.value);
      this.workspace.clearActiveWorkspace();
      await this.redirectAfterAuth();
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      const key = code === 'auth/popup-blocked' ? 'LOGIN_PAGE.ERROR_GOOGLE_POPUP'
        : code === 'auth/operation-not-allowed' || code === 'auth/unauthorized-domain' ? 'LOGIN_PAGE.ERROR_GOOGLE_CONFIG'
        : code === 'auth/account-exists-with-different-credential' ? 'LOGIN_PAGE.ERROR_GOOGLE_EXISTING'
        : 'LOGIN_PAGE.ERROR_GOOGLE';
      this.snackBar.open(this.t(key), this.t('COMMON.CLOSE'), { duration: 7000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async completeGoogleRegistration(): Promise<void> {
    if (this.googleProfileForm.invalid || this.isLoading()) return;
    this.isLoading.set(true);
    try {
      const { name, phone, customerSearchConsent } = this.googleProfileForm.getRawValue();
      await this.authService.completeGoogleProfile(name, phone, this.accountRole(), customerSearchConsent);
      await this.redirectAfterAuth();
    } catch (error: unknown) {
      const key = (error as { details?: { code?: string } }).details?.code === 'PHONE_IN_USE'
        ? 'LOGIN_PAGE.ERROR_PHONE_IN_USE' : 'LOGIN_PAGE.ERROR_REGISTER_FAILED';
      this.snackBar.open(this.t(key), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async cancelGoogleRegistration(): Promise<void> {
    if (this.isLoading()) return;
    await this.authService.logout();
    this.showGoogleCompletion.set(false);
    this.googleProfileForm.reset();
    await this.router.navigate(['/login']);
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
    if (REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      this.showVerification.set(true);
      return;
    }

    const profile = await firstValueFrom(this.userRepo.get(user.uid).pipe(take(1)));
    if ((!profile?.phoneNumber || !profile.role) && user.providerData.some((provider) => provider.providerId === 'google.com')) {
      this.googleProfileForm.patchValue({
        name: profile?.displayName || user.displayName || '',
        phone: profile?.phoneNumber || this.registerForm.controls.phone.value,
        customerSearchConsent: profile?.customerSearchConsent ?? this.registerForm.controls.customerSearchConsent.value,
      });
      if (profile?.role) this.accountRole.set(profile.role);
      this.showGoogleCompletion.set(true);
      return;
    }
    this.showGoogleCompletion.set(false);
    const target = profile?.role === 'owner' ? ['/dashboard'] : ['/my-reservations'];
    await this.router.navigate(target);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}

