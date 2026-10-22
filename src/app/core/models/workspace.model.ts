import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './base.model';
import { CalendarViewMode, WorkspacePlan, WorkspaceStatus, ThemeMode } from './enums';
import { DayOfWeek } from './availability.model';

export type PublicCalendarAccess = 'PRIVATE' | 'BUSY_ONLY';
export type WorkspaceAccessApprovalStatus = 'NOT_REQUIRED' | 'PENDING_PAYMENT' | 'APPROVED';

export interface WorkspaceOperatingRules {
  /** Open days of the week. 0 = Sunday ... 6 = Saturday. */
  workingDays: DayOfWeek[];

  /** Weekly blocked days even if they are part of workingDays. */
  blockedDays: DayOfWeek[];

  /** Daily blocked hours in 24h format. Example: 13 blocks 13:00-13:59. */
  blockedHours: number[];
}

export interface WorkspaceSettings {
  /** Theme applied at workspace level. */
  theme: ThemeMode;

  /** Weekly operating and blocking rules. */
  operatingRules: WorkspaceOperatingRules;

  /**
   * Public visibility policy:
   * - PRIVATE: public cannot view availability or create requests.
   * - BUSY_ONLY: public can see occupied slots (no personal details) and submit booking requests.
   *   Requests must be confirmed by workspace members.
   */
  publicCalendarAccess: PublicCalendarAccess;
}

/**
 * Firestore path: /workspaces/{workspaceId}
 *
 * Tenant root document. Every other workspace-scoped document is a descendant
 * of this path. No cross-tenant query is structurally possible.
 *
 * Document ID: Auto-generated Firestore ID.
 */
export interface Workspace extends FirestoreDocument {
  workspaceId: string;
  name: string;
  businessType: string;

  /**
   * URL-safe unique identifier. Reserved for Phase 2 public booking pages.
   * Null in MVP. When populated, must be globally unique across all workspaces
   * and enforced via a /slugs/{slug} lock collection written by Cloud Function.
   */
  slug: string | null;

  ownerId: string;
  logoUrl: string | null;

  /** IANA timezone identifier. e.g. 'Asia/Beirut', 'UTC', 'America/New_York' */
  timezone: string;

  /** ISO 4217 currency code. e.g. 'USD', 'LBP', 'EUR' */
  currency: string;

  /** Workspace-allowed currencies selected from the global constant catalog. */
  supportedCurrencies?: string[];

  /** Workspace-defined payment methods shown when creating bookings. */
  paymentMethods: string[];

  phone: string | null;
  whishNumber: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;

  /**
   * Default calendar view for this workspace.
   * MONTH:    Best for nightly stays (chalets, guest houses, camps).
   * TIMELINE: Best for hourly bookings (football fields, meeting rooms, event venues).
   * Defaults to MONTH when not set.
   */
  calendarView: CalendarViewMode;

  /**
   * First visible hour in the week view (0–23). e.g. 8 = 08:00.
   * Hours before this are shown as off-hours (dimmed) in the calendar.
   * Defaults to 0 when not set.
   */
  weekViewStartHour: number;

  /**
   * Last visible hour in the week view (1–24). e.g. 22 = visible up to 22:00.
   * Hours from this onward are shown as off-hours (dimmed).
   * Defaults to 24 when not set.
   */
  weekViewEndHour: number;

  /**
   * Future-friendly settings container for workspace-level preferences.
   * Keep this object extensible to avoid schema churn.
   */
  workspaceSettings?: WorkspaceSettings;

  /**
   * Access approval state for entering protected workspace pages.
   * - NOT_REQUIRED: Free plan workspace, accessible immediately.
   * - PENDING_PAYMENT: Paid plan selected, waiting manual payment confirmation.
   * - APPROVED: Payment verified by admin/operator.
   */
  accessApprovalStatus?: WorkspaceAccessApprovalStatus;

  /** Set true only when onboarding is fully approved for paid plans. */
  onboardingCompleted?: boolean;

  /** Timestamp when owner says payment was sent. */
  paymentSubmittedAt?: Timestamp | null;

  /** Timestamp when admin/operator approves paid onboarding. */
  accessApprovedAt?: Timestamp | null;

  plan: WorkspacePlan;
  status: WorkspaceStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Firestore path: /publicWorkspaces/{workspaceId}
 *
 * Public-safe workspace directory entry used by the unauthenticated landing page.
 * Contains only non-sensitive metadata and a link path to public booking.
 */
export interface PublicWorkspaceDirectory {
  workspaceId: string;
  name: string;
  businessType: string;
  timezone: string;
  currency: string;
  address: string | null;
  phone: string | null;
  whishNumber: string | null;
  latitude: number | null;
  longitude: number | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  logoUrl: string | null;
  publicBookingPath: string;
  updatedAt: Timestamp | null;
}
