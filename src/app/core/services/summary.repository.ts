import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  collection,
  collectionData,
  query,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { MonthlySummary } from '../models/summary.model';

/**
 * SummaryRepository
 *
 * Firestore path: /workspaces/{workspaceId}/summaries/{YYYY-MM}
 *
 * READ PATH:  Firestore SDK real-time listeners.
 * WRITE PATH: Cloud Functions only (onReservationWrite trigger).
 *
 * The dashboard subscribes to a single document (current month) via a
 * real-time listener — no aggregate queries are required.
 */
@Injectable({ providedIn: 'root' })
export class SummaryRepository {
  private firestore = inject(Firestore);

  // ── Reads ───────────────────────────────────────────────────────────────────

  /**
   * Real-time stream of the monthly summary for a specific month.
   * @param month YYYY-MM string, e.g. '2026-08'
   */
  getMonth(workspaceId: string, month: string): Observable<MonthlySummary | undefined> {
    return docData<MonthlySummary>(
      doc(this.firestore, this.docPath(workspaceId, month)) as any,
      { idField: 'month' },
    );
  }

  /**
   * Real-time stream of the current month's summary.
   * Convenience method used by the dashboard.
   */
  getCurrentMonth(workspaceId: string): Observable<MonthlySummary | undefined> {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.getMonth(workspaceId, month);
  }

  /**
   * Last N monthly summaries ordered by month descending.
   * Used for the Reports page revenue chart.
   */
  listRecent(workspaceId: string, months = 12): Observable<MonthlySummary[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<MonthlySummary>(
      query(col, orderBy('month', 'desc'), limit(months)) as any,
      { idField: 'month' },
    );
  }

  /**
   * All monthly summaries for a workspace ordered by month ascending.
   * Used for all-time rollups that should stay aligned with the monthly aggregates.
   */
  listAll(workspaceId: string): Observable<MonthlySummary[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<MonthlySummary>(
      query(col, orderBy('month', 'asc')) as any,
      { idField: 'month' },
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private colPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/summaries`;
  }

  private docPath(workspaceId: string, month: string): string {
    return `workspaces/${workspaceId}/summaries/${month}`;
  }
}
