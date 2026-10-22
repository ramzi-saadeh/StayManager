/**
 * StayManager — Firestore Schema Reference
 *
 * This file is the single source of truth for all Firestore collection paths,
 * document shapes, and design constraints. It is intentionally written as pure
 * TypeScript constants so IDEs and the compiler validate the strings.
 *
 * COLLECTION MAP
 * ──────────────
 *
 *  /users/{userId}
 *    └─ UserProfile
 *
 *  /workspaces/{workspaceId}
 *    └─ Workspace
 *    ├─ /resources/{resourceId}
 *    │    └─ Resource
 *    │    └─ /availability/{availabilityId}
 *    │         ├─ WeeklySchedule  (doc ID = 'weekly_schedule', one per resource)
 *    │         └─ BlockedPeriod   (doc ID = auto-generated)
 *    ├─ /reservations/{reservationId}
 *    │    └─ Reservation
 *    │    └─ /auditLog/{logId}
 *    │         └─ AuditLogEntry
 *    ├─ /invitations/{invitationId}
 *    │    └─ Invitation
 *    └─ /summaries/{YYYY-MM}
 *         └─ MonthlySummary
 *
 *  /workspaceMembers/{userId}_{workspaceId}
 *    └─ WorkspaceMember
 *
 *  /slugs/{slug}
 *    └─ { workspaceId: string }   (write-once slug lock)
 *
 * ===========================================================================
 * COLLECTION DETAILS
 * ===========================================================================
 *
 * /users/{userId}
 * ───────────────
 * Document ID  : Firebase Auth UID (deterministic).
 * Write path   : Client SDK on first sign-in / profile update.
 * Read access  : Any authenticated user (member lookups).
 * Key design   : Contains no workspace references. Workspace membership lives
 *                in /workspaceMembers. This decouples identity from tenancy.
 *
 * Fields:
 *   uid          string      Mirrors document ID.
 *   displayName  string
 *   email        string
 *   photoUrl     string|null
 *   createdAt    Timestamp
 *   updatedAt    Timestamp
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}
 * ─────────────────────────
 * Document ID  : Auto-generated Firestore ID.
 * Write path   : createWorkspace Cloud Function only (Admin SDK).
 * Read access  : Workspace members (via custom JWT claim).
 * Key design   : Tenant root. Every sub-collection is scoped here.
 *                No cross-workspace queries are structurally possible.
 *
 * Fields:
 *   workspaceId  string
 *   name         string
 *   slug         string|null   URL-safe identifier (Phase 2 public booking).
 *   ownerId      string        Firebase Auth UID.
 *   logoUrl      string|null
 *   timezone     string        IANA. e.g. 'Asia/Beirut'.
 *   currency     string        ISO 4217. e.g. 'USD'.
 *   phone        string|null
 *   address      string|null
 *   plan         WorkspacePlan  FREE | PRO | ENTERPRISE
 *   status       WorkspaceStatus  ACTIVE | SUSPENDED | DELETED
 *   createdAt    Timestamp
 *   updatedAt    Timestamp
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}/resources/{resourceId}
 * ─────────────────────────────────────────────────
 * Document ID  : Auto-generated Firestore ID.
 * Write path   : Client SDK (OWNER / STAFF).
 * Read access  : All workspace members.
 * Key design   : bookingMode is IMMUTABLE once the first reservation exists.
 *                isActive = false hides the resource from UI without deletion.
 *                attributes map stores type-specific metadata without schema changes.
 *
 * Fields:
 *   resourceId         string
 *   name               string
 *   type               ResourceType
 *   description        string|null
 *   capacity           number|null
 *   bookingMode        BookingMode   DATE_RANGE | DATETIME_RANGE  (immutable after first reservation)
 *   basePrice          number
 *   priceUnit          PriceUnit     PER_NIGHT | PER_HOUR | PER_DAY | FLAT_RATE
 *   minDurationMinutes number|null
 *   maxDurationMinutes number|null
 *   bufferMinutes      number        default 0
 *   imageUrls          string[]      max 10 Firebase Storage URLs
 *   attributes         Record<string,string>  free-form type metadata
 *   isActive           boolean
 *   sortOrder          number
 *   createdBy          string        UID
 *   updatedBy          string        UID
 *   createdAt          Timestamp
 *   updatedAt          Timestamp
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}/resources/{resourceId}/availability/{availabilityId}
 * ───────────────────────────────────────────────────────────────────────────────
 * Two document shapes coexist in this sub-collection, discriminated by `type`.
 *
 * WeeklySchedule  (doc ID = 'weekly_schedule', exactly one per resource)
 *   availabilityId  'weekly_schedule'
 *   type            WEEKLY_SCHEDULE
 *   schedule        DaySchedule[]   7 entries, Sunday–Saturday
 *   updatedBy       string          UID
 *   updatedAt       Timestamp
 *
 * DaySchedule entry:
 *   dayOfWeek   0–6  (JS convention: 0=Sunday)
 *   isOpen      boolean
 *   openTime    string|null  'HH:mm'
 *   closeTime   string|null  'HH:mm'
 *
 * BlockedPeriod  (doc ID = auto-generated)
 *   availabilityId  string
 *   type            BLOCKED_PERIOD
 *   startDate       string   YYYY-MM-DD (inclusive)
 *   endDate         string   YYYY-MM-DD (inclusive)
 *   reason          string|null
 *   createdBy       string   UID
 *   createdAt       Timestamp
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}/reservations/{reservationId}
 * ──────────────────────────────────────────────────────
 * Document ID  : Auto-generated Firestore ID.
 * Write path   : Cloud Functions ONLY (Admin SDK). Never written by client.
 * Read access  : All workspace members.
 * Key design   : customer and price are embedded snapshots — they never change
 *                even if guest data or pricing is updated later.
 *                startDate/endDate strings enable timezone-safe calendar queries.
 *                Soft-delete: deletedAt / deletedBy (never hard-deleted).
 *
 * Fields:
 *   reservationId      string
 *   resourceId         string
 *   resourceName       string      denormalized at write time
 *   resourceType       ResourceType  denormalized at write time
 *   start              Timestamp
 *   end                Timestamp
 *   startDate          string|null  YYYY-MM-DD (DATE_RANGE only)
 *   endDate            string|null  YYYY-MM-DD (DATE_RANGE only)
 *   status             ReservationStatus  PENDING|CONFIRMED|COMPLETED|CANCELLED|DELETED
 *   customer           CustomerRecord     { name, phone, email, notes }
 *   price              PriceSnapshot      { amount, currency, unit, quantity, basePrice }
 *   deposit            DepositRecord|null { amount, status: PaymentStatus }
 *   notes              string|null
 *   attachmentUrls     string[]
 *   createdBy          string   UID
 *   updatedBy          string   UID
 *   createdAt          Timestamp
 *   updatedAt          Timestamp
 *   cancelledBy        string|null
 *   cancelledAt        Timestamp|null
 *   cancellationReason string|null
 *   deletedAt          Timestamp|null
 *   deletedBy          string|null
 *   deletionReason     string|null
 *
 * Status lifecycle:
 *   PENDING → CONFIRMED → COMPLETED → DELETED
 *   PENDING → CANCELLED → DELETED
 *   CONFIRMED → CANCELLED → DELETED
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}/reservations/{reservationId}/auditLog/{logId}
 * ────────────────────────────────────────────────────────────────────────
 * Document ID  : Auto-generated Firestore ID.
 * Write path   : Cloud Functions ONLY. Append-only. Never mutated.
 * Read access  : OWNER and STAFF.
 *
 * Fields:
 *   logId           string
 *   action          AuditAction  CREATED|CONFIRMED|COMPLETED|CANCELLED|DELETED|UPDATED|NOTE_ADDED|ATTACHMENT_ADDED
 *   previousStatus  ReservationStatus|null
 *   newStatus       ReservationStatus|null
 *   changes         Record<string, { from: unknown, to: unknown }>|null
 *   performedBy     string   UID
 *   performedAt     Timestamp
 *   note            string|null
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}/invitations/{invitationId}
 * ──────────────────────────────────────────────────────
 * Document ID  : Auto-generated Firestore ID.
 * Write path   : sendInvitation and acceptInvitation Cloud Functions.
 * Read access  : NONE for clients. CF returns safe projections (no token).
 * Key design   : token field is NEVER exposed to clients (field override disables
 *                indexing; security rules deny all client reads).
 *
 * Fields:
 *   invitationId  string
 *   email         string
 *   role          STAFF | VIEWER
 *   token         string   cryptographically random, email-only delivery
 *   invitedBy     string   UID
 *   invitedAt     Timestamp
 *   expiresAt     Timestamp  default: invitedAt + 48h
 *   status        InvitationStatus  PENDING|ACCEPTED|EXPIRED|REVOKED
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaces/{workspaceId}/summaries/{YYYY-MM}
 * ──────────────────────────────────────────────
 * Document ID  : 'YYYY-MM' string (e.g. '2026-08'). Direct-read pattern.
 * Write path   : onReservationWrite Cloud Function trigger only.
 * Read access  : All workspace members.
 * Key design   : Precomputed aggregate to avoid dashboard aggregate queries
 *                (which do not support real-time listeners in Firestore).
 *                Risk: >50 resources approaches 1MB doc limit → split at Phase 2.
 *
 * Fields:
 *   month              string  YYYY-MM
 *   totalRevenue       number
 *   pendingRevenue     number
 *   confirmedCount     number
 *   pendingCount       number
 *   cancelledCount     number
 *   completedCount     number
 *   deletedCount       number
 *   resourceBreakdown  Record<resourceId, ResourceSummary>
 *   updatedAt          Timestamp
 *
 * ResourceSummary (map entry):
 *   resourceName          string
 *   revenue               number
 *   confirmedCount        number
 *   totalOccupiedMinutes  number
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /workspaceMembers/{userId}_{workspaceId}
 * ─────────────────────────────────────────
 * Document ID  : Composite key "{userId}_{workspaceId}" (deterministic upserts).
 * Write path   : Cloud Functions (acceptInvitation, revokeAccess, onMemberWrite).
 * Read access  : The user themselves OR any member of the same workspace.
 * Key design   : Top-level (not subcollection) to enable:
 *                  - "all workspaces for user X" WHERE userId == X
 *                  - "all members of workspace Y" WHERE workspaceId == Y
 *                Custom JWT claims are the authoritative permission source;
 *                this collection is for display purposes only.
 *
 * Fields:
 *   userId       string   Firebase Auth UID
 *   workspaceId  string
 *   role         WorkspaceRole  OWNER | STAFF | VIEWER
 *   displayName  string   denormalized from /users/{userId}
 *   email        string   denormalized from /users/{userId}
 *   photoUrl     string|null
 *   invitedBy    string|null  UID; null for founding OWNER
 *   joinedAt     Timestamp
 *   updatedAt    Timestamp
 *   isActive     boolean  false = revoked; record preserved for audit
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * /slugs/{slug}
 * ─────────────
 * Document ID  : The slug string itself (e.g. 'mountain-lodge').
 * Write path   : createWorkspace Cloud Function (write-once atomic check).
 * Read access  : NONE for clients (internal mechanism).
 * Key design   : Prevents concurrent slug registration. The document body
 *                contains only workspaceId for audit trail.
 *
 * Fields:
 *   workspaceId  string
 *   reservedAt   Timestamp
 */

// This export ensures the file is treated as a module.
export const SCHEMA_VERSION = '1.0.0';
