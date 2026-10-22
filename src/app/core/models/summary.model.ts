import { Timestamp } from 'firebase/firestore';

/**
 * Per-resource rollup within a MonthlySummary.
 * Keyed by resourceId in the resourceBreakdown map.
 */
export interface ResourceSummary {
  /** Denormalized resource name for display. */
  resourceName: string;

  /** Sum of price.amount for CONFIRMED + COMPLETED reservations. */
  revenue: number;

  confirmedCount: number;

  /** Total occupied duration in minutes (sum of (end - start) for non-cancelled reservations). */
  totalOccupiedMinutes: number;
}

/**
 * Firestore path: /workspaces/{workspaceId}/summaries/{YYYY-MM}
 *
 * One document per calendar month per workspace. Written and maintained
 * exclusively by the onReservationWrite Cloud Function trigger.
 *
 * Read by the dashboard via a real-time Firestore listener on a single document.
 * This pattern avoids dashboard aggregate queries, which do not support listeners.
 *
 * Document ID: 'YYYY-MM' string. e.g. '2026-08'.
 *
 * RISK: If a workspace exceeds 50 resources, the resourceBreakdown map
 * approaches the Firestore 1MB document limit. Mitigation: split into
 * per-resource summary documents at that threshold (Phase 2 concern).
 */
export interface MonthlySummary {
  /** YYYY-MM. Mirrors the document ID. */
  month: string;

  /** Sum of price.amount for CONFIRMED + COMPLETED reservations. */
  totalRevenue: number;

  /** Sum of price.amount for PENDING reservations (tentative / unconfirmed revenue). */
  pendingRevenue: number;

  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  completedCount: number;
  deletedCount: number;

  /** Keyed by resourceId. */
  resourceBreakdown: Record<string, ResourceSummary>;

  /** Timestamp of the last time this document was updated by the CF trigger. */
  updatedAt: Timestamp;
}
