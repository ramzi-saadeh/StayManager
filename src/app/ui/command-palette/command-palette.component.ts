import {
  Component,
  inject,
  signal,
  computed,
  HostListener,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Subject,
  switchMap,
  debounceTime,
  distinctUntilChanged,
  from,
  of,
  catchError,
  tap,
  map,
  takeUntil,
} from 'rxjs';

import { WorkspaceService } from '../../core/services/workspace.service';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { ResourceRepository } from '../../core/services/resource.repository';
import { CommandPaletteService, RecentItem } from '../../core/services/command-palette.service';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import { ResourceType } from '../../core/models/enums';
import { Resource } from '../../core/models/resource.model';
import { Reservation } from '../../core/models/reservation.model';
import { AuthService } from '../../services/auth.service';
import { UserRepository } from '../../core/services/user.repository';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  key: string;
  type: 'reservation' | 'resource' | 'action';
  label: string;
  subtitle: string;
  icon: string;
  route: string[];
  badge?: string;
}

export interface SearchResultGroup {
  title: string;
  items: SearchResultItem[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_TYPE_ICONS: Record<ResourceType, string> = {
  [ResourceType.GUEST_HOUSE]:    'house',
  [ResourceType.CHALET]:         'cabin',
  [ResourceType.FOOTBALL_FIELD]: 'sports_soccer',
  [ResourceType.MEETING_ROOM]:   'meeting_room',
  [ResourceType.CAMP]:           'holiday_village',
  [ResourceType.EVENT_VENUE]:    'celebration',
};

const QUICK_ACTIONS: SearchResultItem[] = [
  {
    key:      'action:new-reservation',
    type:     'action',
    label:    'New Reservation',
    subtitle: 'Create a new booking',
    icon:     'add_circle',
    route:    ['/reservations/new'],
  },
  {
    key:      'action:calendar',
    type:     'action',
    label:    'Calendar',
    subtitle: 'View resource availability',
    icon:     'calendar_month',
    route:    ['/calendar'],
  },
  {
    key:      'action:dashboard',
    type:     'action',
    label:    'Dashboard',
    subtitle: 'Overview & statistics',
    icon:     'dashboard',
    route:    ['/dashboard'],
  },
  {
    key:      'action:resources',
    type:     'action',
    label:    'Resources',
    subtitle: 'Manage chalets, fields & venues',
    icon:     'meeting_room',
    route:    ['/resources'],
  },
  {
    key:      'action:settings',
    type:     'action',
    label:    'Settings',
    subtitle: 'Workspace configuration',
    icon:     'settings',
    route:    ['/settings'],
  },
];

// ── Phone-like query heuristic ────────────────────────────────────────────────

function recentItemToResult(item: RecentItem): SearchResultItem {
  return {
    key:      item.key,
    type:     item.key.startsWith('reservation:') ? 'reservation' : 'resource',
    label:    item.label,
    subtitle: item.subtitle,
    icon:     item.icon,
    route:    item.route,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    StatusBadgeComponent,
  ],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
  private readonly dialogRef      = inject(MatDialogRef<CommandPaletteComponent>);
  private readonly router         = inject(Router);
  private readonly ws             = inject(WorkspaceService);
  private readonly reservRepo     = inject(ReservationRepository);
  private readonly resourceRepo   = inject(ResourceRepository);
  private readonly paletteService = inject(CommandPaletteService);
  private readonly authService    = inject(AuthService);
  private readonly userRepo       = inject(UserRepository);

  private readonly destroy$ = new Subject<void>();

  // ── State ──────────────────────────────────────────────────────────────────

  readonly searchCtrl  = new FormControl('', { nonNullable: true });
  readonly isLoading   = signal(false);
  readonly activeIndex = signal(0);
  readonly query       = signal('');  // mirrors searchCtrl value as a signal

  readonly currentUserProfile = toSignal(
    this.authService.user$.pipe(
      switchMap((user) => (user ? this.userRepo.get(user.uid) : of(null))),
    ),
    { initialValue: null },
  );

  readonly isOwner = computed(() => this.currentUserProfile()?.role === 'owner');

  private readonly resources     = signal<Resource[]>([]);
  private readonly searchResults = signal<SearchResultGroup[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────────

  readonly groups = computed<SearchResultGroup[]>(() => {
    if (!this.query()) return this.buildDefaultGroups();
    return this.searchResults();
  });

  readonly flatItems = computed<SearchResultItem[]>(() =>
    this.groups().flatMap((g) => g.items),
  );

  readonly activeItemId = computed(() =>
    this.flatItems()[this.activeIndex()]?.key ?? null,
  );

  readonly isEmpty = computed(() =>
    !this.isLoading() && this.groups().every((g) => g.items.length === 0),
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const workspaceId = this.ws.activeWorkspaceId();
    if (workspaceId) {
      // Load all active resources once — usually < 50 documents.
      this.resourceRepo
        .listActive(workspaceId)
        .pipe(takeUntil(this.destroy$))
        .subscribe((list) => this.resources.set(list));
    }

    // Search pipeline
    this.searchCtrl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        map((v) => v.trim()),
        tap((q) => {
          this.query.set(q);
          this.activeIndex.set(0);
          if (q.length < 2) {
            this.isLoading.set(false);
            this.searchResults.set([]);
          } else {
            this.isLoading.set(true);
          }
        }),
        switchMap((q) => (q.length < 2 ? of([]) : this.runSearch(q))),
        tap(() => this.isLoading.set(false)),
        takeUntil(this.destroy$),
      )
      .subscribe((groups) => this.searchResults.set(groups));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const total = this.flatItems().length;
    if (total === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update((i) => (i + 1) % total);
        this.scrollActiveItemIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => (i - 1 + total) % total);
        this.scrollActiveItemIntoView();
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.flatItems()[this.activeIndex()];
        if (item) this.select(item);
        break;
      }
      case 'Escape':
        this.close();
        break;
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  select(item: SearchResultItem): void {
    if (item.type !== 'action') {
      const workspaceId = this.ws.activeWorkspaceId();
      const userId = this.authService.getCurrentUser()?.uid;
      this.paletteService.addRecentItem(userId, workspaceId, {
        key:      item.key,
        label:    item.label,
        subtitle: item.subtitle,
        icon:     item.icon,
        route:    item.route,
      });
    }
    this.router.navigate(item.route);
    this.close();
  }

  clearSearch(): void {
    this.searchCtrl.reset();
    this.query.set('');
    this.searchResults.set([]);
    this.activeIndex.set(0);
  }

  close(): void {
    this.dialogRef.close();
  }

  // ── Default groups (shown when query is empty) ─────────────────────────────

  private buildDefaultGroups(): SearchResultGroup[] {
    const groups: SearchResultGroup[] = [];
    const quickActions = this.isOwner()
      ? QUICK_ACTIONS
      : QUICK_ACTIONS.filter((a) => a.key === 'action:dashboard' || a.key === 'action:settings');

    groups.push({ title: 'Quick Actions', items: quickActions });

    if (this.isOwner()) {
      const workspaceId = this.ws.activeWorkspaceId();
      const userId = this.authService.getCurrentUser()?.uid;
      const recent = this.paletteService
        .getRecentItems(userId, workspaceId)
        .map(recentItemToResult);
      if (recent.length > 0) {
        groups.push({ title: 'Recent', items: recent });
      }
    }

    return groups;
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  private runSearch(term: string) {
    const workspaceId = this.ws.activeWorkspaceId();
    if (!workspaceId) return of([]);

    const reservations$ = from(
      this.reservRepo.search(workspaceId, term),
    ).pipe(catchError(() => of([] as Reservation[])));

    return reservations$.pipe(
      map((reservations) => this.buildSearchGroups(term, reservations)),
    );
  }

  private buildSearchGroups(
    term: string,
    reservations: Reservation[],
  ): SearchResultGroup[] {
    const lc = term.toLowerCase();
    const groups: SearchResultGroup[] = [];

    // Quick actions matching the query
    const quickActions = this.isOwner()
      ? QUICK_ACTIONS
      : QUICK_ACTIONS.filter((a) => a.key === 'action:dashboard' || a.key === 'action:settings');
    const matchingActions = quickActions.filter(
      (a) =>
        a.label.toLowerCase().includes(lc) ||
        a.subtitle.toLowerCase().includes(lc),
    );
    if (matchingActions.length > 0) {
      groups.push({ title: 'Quick Actions', items: matchingActions });
    }

    if (this.isOwner()) {
      // Reservation results
      if (reservations.length > 0) {
        groups.push({
          title: `Reservations (${reservations.length})`,
          items: reservations.map((r) => this.reservationToResult(r)),
        });
      }

      // Resource results (client-side filter)
      const matchingResources = this.resources().filter((r) =>
        r.name.toLowerCase().includes(lc),
      );
      if (matchingResources.length > 0) {
        groups.push({
          title: `Resources (${matchingResources.length})`,
          items: matchingResources.map((r) => this.resourceToResult(r)),
        });
      }
    }

    return groups;
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private reservationToResult(r: Reservation): SearchResultItem {
    const icon = RESOURCE_TYPE_ICONS[r.resourceType] ?? 'event';
    const dateLabel = r.startDate
      ? r.startDate
      : r.start.toDate().toLocaleDateString();
    return {
      key:      `reservation:${r.reservationId}`,
      type:     'reservation',
      label:    r.customer.name,
      subtitle: `${r.resourceName} · ${dateLabel}`,
      icon,
      route:    ['/reservations', r.reservationId],
      badge:    r.status,
    };
  }

  private resourceToResult(r: Resource): SearchResultItem {
    const icon = RESOURCE_TYPE_ICONS[r.type] ?? 'meeting_room';
    const typeLabel = r.type.replace(/_/g, ' ');
    return {
      key:      `resource:${r.resourceId}`,
      type:     'resource',
      label:    r.name,
      subtitle: typeLabel,
      icon,
      route:    ['/resources'],
    };
  }

  // ── Scroll helper ──────────────────────────────────────────────────────────

  private scrollActiveItemIntoView(): void {
    // Defer to let Angular update the DOM first.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('.cmd-item--active');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
}
