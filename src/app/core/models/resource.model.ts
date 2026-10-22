import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './base.model';
import { BookingMode, PriceUnit, ResourceType } from './enums';

/**
 * Firestore path: /workspaces/{workspaceId}/resources/{resourceId}
 *
 * Document ID: Auto-generated Firestore ID.
 */
export interface Resource extends FirestoreDocument {
  resourceId: string;
  name: string;
  type: ResourceType;
  description: string | null;

  /** Maximum number of persons. null = unconstrained. */
  capacity: number | null;

  /**
   * Determines the unit of time used for availability and conflict detection.
   * Immutable once the first reservation exists on this resource.
   *
   * DATE_RANGE:     Compare by calendar date (YYYY-MM-DD).
   *                 Suitable for: Guest House, Chalet, Camp.
   * DATETIME_RANGE: Compare by full timestamp.
   *                 Suitable for: Football Field, Meeting Room, Event Venue.
   */
  bookingMode: BookingMode;

  basePrice: number;
  priceUnit: PriceUnit;

  /** Minimum booking duration in minutes. null = no minimum enforced. */
  minDurationMinutes: number | null;

  /** Maximum booking duration in minutes. null = no maximum enforced. */
  maxDurationMinutes: number | null;

  /**
   * Turnaround/preparation time between consecutive bookings, in minutes.
   * The system adds this buffer after a reservation's end time before
   * allowing the next booking to start. Default: 0.
   */
  bufferMinutes: number;

  /** Firebase Storage URLs. Maximum 10 images per resource. */
  imageUrls: string[];

  /**
   * Free-form key/value metadata for type-specific attributes.
   * Keeps the core schema generic without per-type field proliferation.
   *
   * Examples:
   *   { "pitch_size": "11v11", "surface": "artificial_grass" }
   *   { "has_projector": "true", "floor": "3" }
   *   { "max_guests": "6", "has_pool": "true" }
   */
  attributes: Record<string, string>;

  /**
   * false = hidden from reservation creation UI. Historical reservations
   * on this resource are fully preserved.
   */
  isActive: boolean;

  /** Manual display ordering within the workspace. Lower = first. */
  sortOrder: number;

  /** UID of the member who created this resource. */
  createdBy: string;
  createdAt: Timestamp;

  /** UID of the member who last updated this resource. */
  updatedBy: string;
  updatedAt: Timestamp;
}
