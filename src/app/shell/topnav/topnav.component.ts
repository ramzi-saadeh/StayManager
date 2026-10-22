import { Component, output, inject, HostListener, computed, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, switchMap } from 'rxjs/operators';
import { combineLatest, of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { CommandPaletteService } from '../../core/services/command-palette.service';
import { PlatformAdminService } from '../../core/services/platform-admin.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { UserRepository } from '../../core/services/user.repository';
import { ReservationRepository } from '../../core/services/reservation.repository';

@Component({
  selector: 'app-topnav',
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    CommonModule,
    TranslatePipe,
  ],
  templateUrl: './topnav.component.html',
  styleUrl: './topnav.component.scss',
})
export class TopnavComponent {
  menuClick = output<void>();

  readonly authService      = inject(AuthService);
  readonly router           = inject(Router);
  readonly platformAdmin    = inject(PlatformAdminService);
  private readonly userRepo = inject(UserRepository);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly reservationRepo = inject(ReservationRepository);
  private  readonly dialog  = inject(MatDialog);
  private  readonly palette = inject(CommandPaletteService);

  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );

  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');
  readonly notificationsOpen = signal(false);
  readonly notificationLoadError = signal(false);
  readonly pendingReservations = toSignal(
    combineLatest([
      toObservable(this.workspaceService.activeWorkspaceId),
      toObservable(this.isOwner),
    ]).pipe(
      switchMap(([workspaceId, isOwner]) => {
        this.notificationLoadError.set(false);
        if (!isOwner || !workspaceId) return of([]);
        return this.reservationRepo
          .listPending(workspaceId)
          .pipe(
            catchError((error) => {
              console.error('Could not load pending booking requests.', error);
              this.notificationLoadError.set(true);
              return of([]);
            }),
          );
      }),
    ),
    { initialValue: [] },
  );
  readonly pendingRequestCount = computed(() => this.pendingReservations().length);
  readonly latestPendingRequests = computed(() => this.pendingReservations().slice(0, 5));

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.notificationsOpen.set(false);
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.openPalette();
    }
  }

  openPalette(): void {
    this.palette.open(this.dialog);
  }

  openReservationNotification(reservationId: string): void {
    this.notificationsOpen.set(false);
    this.router.navigate(['/reservations', reservationId]);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && !target.closest('.notifications-anchor')) {
      this.notificationsOpen.set(false);
    }
  }

  onMenuClick() {
    this.menuClick.emit();
  }

  onLogout() {
    this.workspaceService.clearActiveWorkspace();
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
