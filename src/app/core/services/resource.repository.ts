import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  getDoc,
  getDocs,
  doc,
  docData,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Resource } from '../models/resource.model';
import { ResourceType, WorkspacePlan } from '../models/enums';
import { StorageService } from './storage.service';
import { OmitFirestoreFields } from '../models/base.model';
import { Workspace } from '../models/workspace.model';

export interface PublicResource {
  resourceId: string;
  name: string;
  type: ResourceType;
  bookingMode: Resource['bookingMode'];
  basePrice: number;
  priceUnit: Resource['priceUnit'];
  isActive: boolean;
  sortOrder: number;
}

export interface CreateResourcePayload
  extends OmitFirestoreFields<Omit<Resource, 'resourceId' | 'createdBy' | 'updatedBy'>> {}

export interface UpdateResourcePayload {
  name?: string;
  description?: string | null;
  capacity?: number | null;
  basePrice?: number;
  priceUnit?: Resource['priceUnit'];
  minDurationMinutes?: number | null;
  maxDurationMinutes?: number | null;
  bufferMinutes?: number;
  attributes?: Record<string, string>;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * ResourceRepository
 *
 * Firestore path: /workspaces/{workspaceId}/resources/{resourceId}
 *
 * Read path:  Firestore SDK real-time listeners (client).
 * Write path: Firestore SDK (OWNER/STAFF — enforced by security rules).
 *
 * bookingMode is intentionally absent from UpdateResourcePayload:
 * it is immutable once the first reservation exists and must only be set at
 * resource creation time.
 */
@Injectable({ providedIn: 'root' })
export class ResourceRepository {
  private firestore = inject(Firestore);
  private storage   = inject(StorageService);
  private readonly FREE_RESOURCE_LIMIT = 1;

  // ── Reads ───────────────────────────────────────────────────────────────────

  /** Real-time stream of all active resources, ordered for display. */
  listActive(workspaceId: string): Observable<Resource[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<Resource>(
      query(col, where('isActive', '==', true), orderBy('sortOrder')) as any,
      { idField: 'resourceId' },
    );
  }

  /** Real-time stream of ALL resources (including inactive), for admin views. */
  listAll(workspaceId: string): Observable<Resource[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    // No orderBy — avoids needing a composite index during development.
    // Sort client-side instead.
    return collectionData<Resource>(col as any, { idField: 'resourceId' });
  }

  /** Real-time stream of active resources of a specific type. */
  listByType(workspaceId: string, type: ResourceType): Observable<Resource[]> {
    const col = collection(this.firestore, this.colPath(workspaceId));
    return collectionData<Resource>(
      query(
        col,
        where('type', '==', type),
        where('isActive', '==', true),
        orderBy('sortOrder'),
      ) as any,
      { idField: 'resourceId' },
    );
  }

  /** Real-time stream of a single resource document. */
  get(workspaceId: string, resourceId: string): Observable<Resource | undefined> {
    return docData<Resource>(
      doc(this.firestore, this.docPath(workspaceId, resourceId)) as any,
      { idField: 'resourceId' },
    );
  }

  listPublicActive(workspaceId: string): Observable<PublicResource[]> {
    const col = collection(this.firestore, this.publicColPath(workspaceId));
    return collectionData<PublicResource>(col as any, { idField: 'resourceId' }).pipe(
      map((resources) => {
        return resources
          .map((resource) => ({
            ...resource,
            basePrice: Number(resource.basePrice ?? 0),
            priceUnit: resource.priceUnit ?? 'PER_NIGHT',
            isActive: resource.isActive !== false,
            sortOrder: Number(resource.sortOrder ?? 0),
          }))
          .filter((resource) => resource.isActive)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      }),
    );
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  /** Create a new resource. Returns the new resourceId. */
  async create(
    workspaceId: string,
    payload: CreateResourcePayload,
    createdBy: string,
  ): Promise<string> {
    const workspaceRef = doc(this.firestore, `workspaces/${workspaceId}`);
    const workspaceSnap = await getDoc(workspaceRef as any);
    const workspace = workspaceSnap.data() as Workspace | undefined;

    if (this.isFreePlan(workspace?.plan)) {
      const resourcesSnapshot = await getDocs(collection(this.firestore, this.colPath(workspaceId)) as any);
      if (resourcesSnapshot.size >= this.FREE_RESOURCE_LIMIT) {
        throw new Error('FREE_PLAN_RESOURCE_LIMIT');
      }
    }

    const ref = doc(collection(this.firestore, this.colPath(workspaceId)));
    await setDoc(ref, {
      ...payload,
      resourceId: ref.id,
      createdBy,
      updatedBy:  createdBy,
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    });

    await setDoc(doc(this.firestore, this.publicDocPath(workspaceId, ref.id)), {
      resourceId: ref.id,
      name: payload.name,
      type: payload.type,
      bookingMode: payload.bookingMode,
      basePrice: payload.basePrice ?? 0,
      priceUnit: payload.priceUnit ?? 'PER_NIGHT',
      isActive: payload.isActive ?? true,
      sortOrder: payload.sortOrder ?? 0,
      updatedAt: serverTimestamp(),
    });

    return ref.id;
  }

  /** Update mutable resource fields. bookingMode cannot be changed here. */
  async update(
    workspaceId: string,
    resourceId: string,
    payload: UpdateResourcePayload,
    updatedBy: string,
  ): Promise<void> {
    const ref = doc(this.firestore, this.docPath(workspaceId, resourceId));
    await updateDoc(ref, {
      ...payload,
      updatedBy,
      updatedAt: serverTimestamp(),
    });

    const snapshot = await getDoc(ref as any);
    if (!snapshot.exists()) return;

    const resource = snapshot.data() as Resource;
    await setDoc(doc(this.firestore, this.publicDocPath(workspaceId, resourceId)), {
      resourceId,
      name: resource.name,
      type: resource.type,
      bookingMode: resource.bookingMode,
      basePrice: resource.basePrice ?? 0,
      priceUnit: resource.priceUnit ?? 'PER_NIGHT',
      isActive: resource.isActive ?? true,
      sortOrder: resource.sortOrder ?? 0,
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Soft-deactivate a resource. isActive = false hides it from booking UI
   * but preserves all historical reservations.
   */
  async deactivate(workspaceId: string, resourceId: string, updatedBy: string): Promise<void> {
    await this.update(workspaceId, resourceId, { isActive: false }, updatedBy);
  }

  /** Reactivate a previously deactivated resource. */
  async activate(workspaceId: string, resourceId: string, updatedBy: string): Promise<void> {
    await this.update(workspaceId, resourceId, { isActive: true }, updatedBy);
  }

  /**
   * Rebuild public resource projection for all resources in a workspace.
   * Useful for backfilling legacy data introduced before public catalog support.
   */
  async republishPublicCatalog(workspaceId: string): Promise<number> {
    const snapshot = await getDocs(collection(this.firestore, this.colPath(workspaceId)) as any);
    const writes = snapshot.docs.map((resourceDoc) => {
      const resource = resourceDoc.data() as Resource;
      const resourceId = resource.resourceId || resourceDoc.id;
      return setDoc(doc(this.firestore, this.publicDocPath(workspaceId, resourceId)), {
        resourceId,
        name: resource.name,
        type: resource.type,
        bookingMode: resource.bookingMode,
        basePrice: resource.basePrice ?? 0,
        priceUnit: resource.priceUnit ?? 'PER_NIGHT',
        isActive: resource.isActive ?? true,
        sortOrder: resource.sortOrder ?? 0,
        updatedAt: serverTimestamp(),
      });
    });

    await Promise.all(writes);
    return snapshot.docs.length;
  }

  // ── Image management ────────────────────────────────────────────────────────

  /**
   * Upload a resource image. Returns an UploadTask.
   * After upload completes, append the downloadUrl to imageUrls via update().
   */
  uploadImage(workspaceId: string, resourceId: string, file: File) {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = this.storage.resourceImagePath(
      workspaceId,
      resourceId,
      `img_${Date.now()}.${ext}`,
    );
    return this.storage.upload(path, file);
  }

  /** Add a Storage download URL to the resource's imageUrls array. */
  async addImageUrl(
    workspaceId: string,
    resourceId: string,
    downloadUrl: string,
    updatedBy: string,
  ): Promise<void> {
    const ref = doc(this.firestore, this.docPath(workspaceId, resourceId));
    await updateDoc(ref, {
      imageUrls: arrayUnion(downloadUrl),
      updatedBy,
      updatedAt: serverTimestamp(),
    });
  }

  /** Remove a URL from the resource's imageUrls array. */
  async removeImageUrl(
    workspaceId: string,
    resourceId: string,
    downloadUrl: string,
    updatedBy: string,
  ): Promise<void> {
    const ref = doc(this.firestore, this.docPath(workspaceId, resourceId));
    await updateDoc(ref, {
      imageUrls: arrayRemove(downloadUrl),
      updatedBy,
      updatedAt: serverTimestamp(),
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private colPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/resources`;
  }

  private docPath(workspaceId: string, resourceId: string): string {
    return `workspaces/${workspaceId}/resources/${resourceId}`;
  }

  private publicColPath(workspaceId: string): string {
    return `workspaces/${workspaceId}/publicResources`;
  }

  private publicDocPath(workspaceId: string, resourceId: string): string {
    return `workspaces/${workspaceId}/publicResources/${resourceId}`;
  }

  private isFreePlan(value: unknown): boolean {
    const raw = String(value ?? '').trim().toUpperCase();
    return raw === WorkspacePlan.FREE;
  }
}
