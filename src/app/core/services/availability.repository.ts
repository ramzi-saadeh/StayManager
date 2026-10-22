import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { WeeklySchedule, BlockedPeriod } from '../models/availability.model';
import { AvailabilityType } from '../models/enums';

type Availability = WeeklySchedule | BlockedPeriod;

/**
 * AvailabilityRepository
 *
 * Firestore path: /workspaces/{wid}/resources/{rid}/availability/{availabilityId}
 *
 * Two document types coexist:
 *   - WeeklySchedule (doc ID = 'weekly_schedule', singleton per resource)
 *   - BlockedPeriod  (auto-generated IDs, multiple per resource)
 *
 * Write path: Firestore SDK (OWNER/STAFF — enforced by security rules).
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityRepository {
  private firestore = inject(Firestore);

  // ── Weekly schedule ─────────────────────────────────────────────────────────

  /** Real-time stream of the weekly schedule for a resource. */
  getWeeklySchedule(workspaceId: string, resourceId: string): Observable<WeeklySchedule | undefined> {
    return docData<WeeklySchedule>(
      doc(this.firestore, this.weeklySchedulePath(workspaceId, resourceId)) as any,
      { idField: 'availabilityId' },
    );
  }

  /**
   * Create or fully replace the weekly schedule.
   * Uses setDoc (upsert) because the doc ID is deterministic ('weekly_schedule').
   */
  async setWeeklySchedule(
    workspaceId: string,
    resourceId: string,
    schedule: WeeklySchedule['schedule'],
    updatedBy: string,
  ): Promise<void> {
    const ref = doc(this.firestore, this.weeklySchedulePath(workspaceId, resourceId));
    await setDoc(ref, {
      availabilityId: 'weekly_schedule',
      type: AvailabilityType.WEEKLY_SCHEDULE,
      schedule,
      updatedBy,
      updatedAt: serverTimestamp(),
    });
  }

  // ── Blocked periods ─────────────────────────────────────────────────────────

  /** Real-time stream of all blocked periods for a resource. */
  listBlockedPeriods(workspaceId: string, resourceId: string): Observable<BlockedPeriod[]> {
    const col = collection(this.firestore, this.colPath(workspaceId, resourceId));
    return collectionData<BlockedPeriod>(
      query(
        col,
        where('type', '==', AvailabilityType.BLOCKED_PERIOD),
        orderBy('startDate', 'asc'),
      ) as any,
      { idField: 'availabilityId' },
    );
  }

  /**
   * Blocked periods overlapping a date window.
   * Used by conflict detection: windowStart and windowEnd are YYYY-MM-DD.
   * Firestore can only filter one side; client-side filter the other.
   */
  listBlockedPeriodsInWindow(
    workspaceId: string,
    resourceId: string,
    windowStart: string,
    windowEnd: string,
  ): Observable<BlockedPeriod[]> {
    const col = collection(this.firestore, this.colPath(workspaceId, resourceId));
    return collectionData<BlockedPeriod>(
      query(
        col,
        where('type', '==', AvailabilityType.BLOCKED_PERIOD),
        where('startDate', '<=', windowEnd),
        orderBy('startDate', 'asc'),
      ) as any,
      { idField: 'availabilityId' },
    );
  }

  /** Create a new blocked period. Returns the new availabilityId. */
  async createBlockedPeriod(
    workspaceId: string,
    resourceId: string,
    payload: Omit<BlockedPeriod, 'availabilityId' | 'createdBy' | 'createdAt'>,
    createdBy: string,
  ): Promise<string> {
    const col = collection(this.firestore, this.colPath(workspaceId, resourceId));
    const ref = await addDoc(col, {
      ...payload,
      type: AvailabilityType.BLOCKED_PERIOD,
      createdBy,
      createdAt: serverTimestamp(),
    });
    await updateDoc(ref, { availabilityId: ref.id });
    return ref.id;
  }

  /** Delete a blocked period. */
  async deleteBlockedPeriod(
    workspaceId: string,
    resourceId: string,
    availabilityId: string,
  ): Promise<void> {
    await deleteDoc(
      doc(this.firestore, `${this.colPath(workspaceId, resourceId)}/${availabilityId}`),
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private colPath(workspaceId: string, resourceId: string): string {
    return `workspaces/${workspaceId}/resources/${resourceId}/availability`;
  }

  private weeklySchedulePath(workspaceId: string, resourceId: string): string {
    return `${this.colPath(workspaceId, resourceId)}/weekly_schedule`;
  }
}
