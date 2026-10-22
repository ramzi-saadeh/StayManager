import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AppLanguage, LanguageService } from '../../core/services/language.service';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';
import { WorkspaceService } from '../../core/services/workspace.service';

/**
 * PublicLayoutComponent
 *
 * Shared shell for all public-facing (unauthenticated storefront) pages:
 * public home and public booking. Owns the toolbar/header, mobile menu,
 * language switch, and auth-aware navigation (Login vs. Open dashboard)
 * so every public route gets identical chrome and auth handling for free.
 *
 * Route children render into the <router-outlet>.
 */
@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss',
})
export class PublicLayoutComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private userRepo = inject(UserRepository);
  private workspaceService = inject(WorkspaceService);
  readonly languageService = inject(LanguageService);

  readonly currentUser = toSignal(this.authService.user$, { initialValue: null });
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );
  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');

  readonly languageOptions = this.languageService.languages;

  isCompactNav = signal(false);
  isMobileMenuOpen = signal(false);

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.isCompactNav.set(window.scrollY > 18);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  async logout(): Promise<void> {
    this.closeMobileMenu();
    this.workspaceService.clearActiveWorkspace();
    await this.authService.logout();
    await this.router.navigateByUrl('/');
  }

  onLanguageChange(lang: AppLanguage): void {
    this.languageService.setLanguage(lang);
  }
}
