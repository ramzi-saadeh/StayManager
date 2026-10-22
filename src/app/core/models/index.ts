// =============================================================================
// ENUMS
// =============================================================================
export {
  WorkspaceRole,
  WorkspacePlan,
  WorkspaceStatus,
  ResourceType,
  BookingMode,
  PriceUnit,
  RecurrenceFrequency,
  AvailabilityType,
  ReservationStatus,
  BLOCKING_STATUSES,
  PaymentStatus,
  InvitationStatus,
  AuditAction,
} from './enums';

// =============================================================================
// CURRENCIES
// =============================================================================
export { CURRENCIES, getCurrency, getCurrencySymbol } from './currencies';
export type { Currency } from './currencies';

// =============================================================================
// BASE / UTILITY TYPES
// =============================================================================
export type {
  FirestoreDocument,
  SoftDeletable,
  FirebaseCustomClaims,
  OmitFirestoreFields,
  DeepPartial,
} from './base.model';

// =============================================================================
// DOMAIN MODELS
// =============================================================================
export type { UserProfile } from './user.model';

export type { Workspace } from './workspace.model';

export type { WorkspaceMember } from './workspace-member.model';

export type { InvitableRole, Invitation } from './invitation.model';

export type { Resource } from './resource.model';

export type {
  DayOfWeek,
  DaySchedule,
  WeeklySchedule,
  BlockedPeriod,
  Availability,
} from './availability.model';

export type {
  CustomerRecord,
  PriceSnapshot,
  DepositRecord,
  Reservation,
} from './reservation.model';

export type {
  Weekday,
  RecurrenceEnd,
  RecurrenceRule,
  SeriesScope,
} from './recurrence.model';

export type {
  WorkspaceCustomer,
  UpsertWorkspaceCustomerInput,
} from './customer.model';

export type { FieldChange, AuditLogEntry } from './audit-log.model';

export type { ResourceSummary, MonthlySummary } from './summary.model';

export type { Expense } from './expense.model';
