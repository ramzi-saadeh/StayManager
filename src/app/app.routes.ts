import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { ownerGuard } from './guards/owner.guard';
import { workspaceGuard } from './guards/workspace.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { customerGuard } from './guards/customer.guard';

export const routes: Routes = [
  // ── Public storefront (shared layout: toolbar + auth-aware nav) ─────────────
  {
    path: '',
    loadComponent: () =>
      import('./features/public-layout/public-layout.component').then(
        (m) => m.PublicLayoutComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/public-home/public-home.component').then(
            (m) => m.PublicHomeComponent,
          ),
        data: {
          title: 'Find and Book Workspaces',
          description:
            'Discover, compare, and book workspaces, chalets, camps, and venues with real-time availability.',
          robots: 'index, follow',
          canonicalPath: '/',
          ogType: 'website',
        },
      },
      {
        path: 'book/:workspaceId',
        loadComponent: () =>
          import('./features/public-booking/public-booking.component').then(
            (m) => m.PublicBookingComponent,
          ),
        data: {
          title: 'Book This Workspace',
          description:
            'View live availability and submit a booking request in minutes with StayManager public booking.',
          robots: 'index, follow',
          ogType: 'website',
        },
      },
      {
        path: 'my-reservations',
        canActivate: [authGuard, customerGuard],
        loadComponent: () =>
          import('./features/customer-reservations/customer-reservations.component').then(
            (m) => m.CustomerReservationsComponent,
          ),
        data: {
          title: 'My Reservations',
          description: 'View reservation requests and booking status.',
          robots: 'noindex, nofollow',
        },
      },
    ],
  },

  // ── Public ──────────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then((m) => m.LoginComponent),
    data: {
      title: 'Sign In',
      description: 'Sign in to StayManager to manage reservations, resources, and workspace operations.',
      robots: 'noindex, nofollow',
    },
  },

  // ── First-run: create workspace ──────────────────────────────────────────────
  {
    path: 'onboarding',
    canActivate: [authGuard, ownerGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
    data: {
      title: 'Set Up Your Workspace',
      description: 'Configure your workspace settings and start managing your stay operations.',
      robots: 'noindex, nofollow',
    },
  },

  // ── Paid onboarding pending approval ───────────────────────────────────────
  {
    path: 'activation-pending',
    canActivate: [authGuard, ownerGuard],
    loadComponent: () =>
      import('./features/activation-pending/activation-pending.component').then(
        (m) => m.ActivationPendingComponent,
      ),
    data: {
      title: 'Activation Pending',
      description: 'Your paid workspace is pending manual payment confirmation before access is enabled.',
      robots: 'noindex, nofollow',
    },
  },

  // ── Platform super admin ──────────────────────────────────────────────────
  {
    path: 'super-admin/approvals',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () =>
      import('./features/super-admin-approvals/super-admin-approvals.component').then(
        (m) => m.SuperAdminApprovalsComponent,
      ),
    data: {
      title: 'Super Admin Approvals',
      description: 'Review and approve paid workspace onboarding requests.',
      robots: 'noindex, nofollow',
    },
  },

  // ── Legacy invitation URL (token acceptance is not currently supported) ──────
  {
    path: 'accept-invite',
    loadComponent: () =>
      import('./features/accept-invite/accept-invite.component').then(
        (m) => m.AcceptInviteComponent,
      ),
    data: {
      title: 'Accept Invitation',
      description: 'Invitation links are not currently supported.',
      robots: 'noindex, nofollow',
    },
  },

  {
    path: 'terms',
    loadComponent: () =>
      import('./features/legal/terms-page/terms-page.component').then(
        (m) => m.TermsPageComponent,
      ),
    data: {
      title: 'Terms of Service',
      description: 'Read StayManager terms for plans, billing, acceptable use, and account responsibilities.',
      robots: 'index, follow',
      canonicalPath: '/terms',
      ogType: 'article',
    },
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/legal/privacy-page/privacy-page.component').then(
        (m) => m.PrivacyPageComponent,
      ),
    data: {
      title: 'Privacy Policy',
      description: 'Understand what data StayManager collects, how it is used, and your privacy choices.',
      robots: 'index, follow',
      canonicalPath: '/privacy',
      ogType: 'article',
    },
  },

  // ── Protected app shell ──────────────────────────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard, workspaceGuard],
    data: {
      robots: 'noindex, nofollow',
    },
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // Dashboard
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { title: 'Dashboard' },
      },

      // Calendar
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
        data: { title: 'Calendar' },
      },

      // Reservations
      {
        path: 'reservations',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/reservations/reservations.component').then(
                (m) => m.ReservationsComponent,
              ),
            data: { title: 'Reservations' },
          },
          {
            path: 'new',
            canActivate: [ownerGuard],
            loadComponent: () =>
              import('./features/reservations/reservation-form/reservation-form.component').then(
                (m) => m.ReservationFormComponent,
              ),
            data: { title: 'New Booking' },
          },
          {
            path: ':id/receipt',
            loadComponent: () =>
              import('./features/reservations/reservation-receipt/reservation-receipt.component').then(
                (m) => m.ReservationReceiptComponent,
              ),
            data: { title: 'Reservation Receipt' },
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/reservations/reservation-detail/reservation-detail.component').then(
                (m) => m.ReservationDetailComponent,
              ),
            data: { title: 'Reservation' },
          },
        ],
      },

      // Resources
      {
        path: 'resources',
        canActivate: [ownerGuard],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/resources/resources.component').then(
                (m) => m.ResourcesComponent,
              ),
            data: { title: 'Resources' },
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/resources/resource-form/resource-form.component').then(
                (m) => m.ResourceFormComponent,
              ),
            data: { title: 'New Resource' },
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/resources/resource-form/resource-form.component').then(
                (m) => m.ResourceFormComponent,
              ),
            data: { title: 'Edit Resource' },
          },
        ],
      },

      // Finance
      {
        path: 'finance',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/finance/finance.component').then((m) => m.FinanceComponent),
        data: { title: 'Finance' },
      },

      // Reports
      {
        path: 'reports',
        canActivate: [ownerGuard],
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
        data: { title: 'Reports' },
      },

      // Settings
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
        data: { title: 'Settings' },
        children: [
          { path: '', redirectTo: 'profile', pathMatch: 'full' },
          {
            path: 'workspace',
            canActivate: [ownerGuard],
            loadComponent: () =>
              import('./features/settings/workspace-settings/workspace-settings.component').then(
                (m) => m.WorkspaceSettingsComponent,
              ),
            data: { title: 'Workspace Settings' },
          },
          {
            path: 'members',
            canActivate: [ownerGuard],
            loadComponent: () =>
              import('./features/settings/members/members.component').then(
                (m) => m.MembersComponent,
              ),
            data: { title: 'Members' },
          },
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/settings/profile/profile.component').then(
                (m) => m.ProfileComponent,
              ),
            data: { title: 'My Profile' },
          },
        ],
      },
    ],
  },

  // Catch-all
  { path: '**', redirectTo: 'login' },
];
// {
//   path: '',
