// =============================================================================
// CLOUD FUNCTION ERROR CODES
// =============================================================================

/**
 * Exhaustive set of typed error codes returned by all Cloud Functions.
 * The Angular ErrorHandlerService maps these to user-facing messages via i18n keys.
 * Never expose raw Firebase error codes or exception messages to the user.
 */
export enum CloudFunctionErrorCode {
  // --- Auth ---
  /** Request made without a valid Firebase ID token. */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Authenticated user does not have the required role for this operation. */
  FORBIDDEN = 'FORBIDDEN',

  // --- Reservation ---
  /** The requested time slot overlaps with an existing PENDING or CONFIRMED reservation. */
  RESERVATION_CONFLICT = 'RESERVATION_CONFLICT',
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',
  /** The requested status transition is not permitted by the lifecycle rules. */
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',

  // --- Workspace ---
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  WORKSPACE_SUSPENDED = 'WORKSPACE_SUSPENDED',

  // --- Resource ---
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  /** Reservation attempt on a resource with isActive = false. */
  RESOURCE_INACTIVE = 'RESOURCE_INACTIVE',
  /**
   * Attempt to change bookingMode on a resource that already has reservations.
   * bookingMode is immutable once the first reservation exists.
   */
  RESOURCE_BOOKING_MODE_IMMUTABLE = 'RESOURCE_BOOKING_MODE_IMMUTABLE',

  // --- Availability ---
  /** Reservation falls outside the resource's weekly schedule. */
  OUTSIDE_AVAILABILITY = 'OUTSIDE_AVAILABILITY',
  /** Reservation overlaps a blocked period. */
  BLOCKED_PERIOD_CONFLICT = 'BLOCKED_PERIOD_CONFLICT',
  /** Booking duration is shorter than the resource's minDurationMinutes. */
  BELOW_MIN_DURATION = 'BELOW_MIN_DURATION',
  /** Booking duration exceeds the resource's maxDurationMinutes. */
  EXCEEDS_MAX_DURATION = 'EXCEEDS_MAX_DURATION',

  // --- Member / Invitation ---
  INVITATION_NOT_FOUND = 'INVITATION_NOT_FOUND',
  INVITATION_EXPIRED = 'INVITATION_EXPIRED',
  INVITATION_ALREADY_ACCEPTED = 'INVITATION_ALREADY_ACCEPTED',
  /** An active WorkspaceMember already exists for this email. */
  MEMBER_ALREADY_EXISTS = 'MEMBER_ALREADY_EXISTS',
  /** Attempt to revoke or downgrade the workspace Owner's own membership. */
  CANNOT_MODIFY_OWNER = 'CANNOT_MODIFY_OWNER',

  // --- Validation ---
  /** Request payload failed schema validation. details field will contain specifics. */
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // --- System ---
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// =============================================================================
// CLOUD FUNCTION RESPONSE ENVELOPE
// =============================================================================

/**
 * Standard success response envelope from all Cloud Functions.
 * T is the function-specific payload type (use void for operations with no data to return).
 */
export interface CloudFunctionResponse<T = void> {
  success: true;
  data: T extends void ? never : T;

  /** ISO 8601 server timestamp. */
  timestamp: string;
}

/**
 * Standard error response envelope from all Cloud Functions.
 * The Angular FunctionService maps HTTP error responses to this shape.
 */
export interface CloudFunctionErrorResponse {
  success: false;
  code: CloudFunctionErrorCode;
  message: string;

  /**
   * Additional context for VALIDATION_ERROR responses.
   * e.g. { "field": "startDate", "issue": "must be before endDate" }
   */
  details?: Record<string, string>;

  /** ISO 8601 server timestamp. */
  timestamp: string;
}

/**
 * Union type for Cloud Function call return values.
 * Use type narrowing on the `success` discriminant:
 *
 *   if (result.success) { // CloudFunctionResponse<T> }
 *   else { // CloudFunctionErrorResponse }
 */
export type CloudFunctionResult<T = void> =
  | CloudFunctionResponse<T>
  | CloudFunctionErrorResponse;
