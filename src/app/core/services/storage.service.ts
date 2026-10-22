import { Injectable, inject } from '@angular/core';
import {
  Storage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from '@angular/fire/storage';
import { Observable, from } from 'rxjs';

export interface UploadTask {
  /** Signals upload progress 0–100. */
  progress$: Observable<number>;
  /** Resolves with the public download URL when upload completes. */
  downloadUrl$: Promise<string>;
}

/**
 * Wraps Firebase Storage operations.
 * All paths are namespaced under the workspaceId to align with security rules.
 *
 * Storage path conventions:
 *   workspaces/{workspaceId}/logos/{filename}
 *   workspaces/{workspaceId}/resources/{resourceId}/{filename}
 *   workspaces/{workspaceId}/reservations/{reservationId}/{filename}
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private storage = inject(Storage);

  /**
   * Upload a file and return a progress observable + download URL promise.
   * Caller picks the storage path; this service only wraps the SDK.
   */
  upload(storagePath: string, file: File): UploadTask {
    const storageRef = ref(this.storage, storagePath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    const progress$ = new Observable<number>((subscriber) => {
      task.on(
        'state_changed',
        (snapshot) => {
          subscriber.next((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        },
        (err) => subscriber.error(err),
        () => subscriber.complete(),
      );
      return () => task.cancel();
    });

    const downloadUrl$ = task.then(() => getDownloadURL(storageRef)) as Promise<string>;

    return { progress$, downloadUrl$ };
  }

  /** Delete a file by its full storage path. */
  delete(storagePath: string): Promise<void> {
    const storageRef = ref(this.storage, storagePath);
    return deleteObject(storageRef);
  }

  /** Build the storage path for a workspace logo. */
  logoPath(workspaceId: string, filename: string): string {
    return `workspaces/${workspaceId}/logos/${filename}`;
  }

  /** Build the storage path for a resource image. */
  resourceImagePath(workspaceId: string, resourceId: string, filename: string): string {
    return `workspaces/${workspaceId}/resources/${resourceId}/${filename}`;
  }

  /** Build the storage path for a reservation attachment. */
  reservationAttachmentPath(
    workspaceId: string,
    reservationId: string,
    filename: string,
  ): string {
    return `workspaces/${workspaceId}/reservations/${reservationId}/${filename}`;
  }
}
