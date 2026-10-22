import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable, HttpsCallableResult } from '@angular/fire/functions';
import {
  CloudFunctionErrorCode,
  CloudFunctionErrorResponse,
  CloudFunctionResponse,
  CloudFunctionResult,
} from '../dtos/cloud-function.dto';

/**
 * Thin wrapper around AngularFire httpsCallable.
 *
 * All Cloud Functions return the CloudFunctionResult<T> envelope.
 * This service normalises network/Firebase errors into the same
 * CloudFunctionErrorResponse shape so callers only need to check `result.success`.
 *
 * Usage:
 *   const result = await this.cf.call<CreateReservationResponseData>(
 *     'createReservation', dto
 *   );
 *   if (result.success) { ... result.data.reservationId ... }
 *   else { ... result.code ... }
 */
@Injectable({ providedIn: 'root' })
export class CloudFunctionService {
  private functions = inject(Functions);

  async call<TResponse = void, TPayload = unknown>(
    name: string,
    payload: TPayload,
  ): Promise<CloudFunctionResult<TResponse>> {
    try {
      const callable = httpsCallable<TPayload, CloudFunctionResponse<TResponse>>(
        this.functions,
        name,
      );
      const result: HttpsCallableResult<CloudFunctionResponse<TResponse>> =
        await callable(payload);
      return result.data;
    } catch (err: unknown) {
      return this.normalizeError(err);
    }
  }

  private normalizeError(err: unknown): CloudFunctionErrorResponse {
    // AngularFire wraps CF errors as FirebaseError with a `details` property
    if (this.isFirebaseError(err)) {
      const details = (err as Record<string, unknown>)['details'] as
        | CloudFunctionErrorResponse
        | undefined;
      if (details && 'code' in details) {
        return details;
      }
      return {
        success: false,
        code: CloudFunctionErrorCode.INTERNAL_ERROR,
        message: err.message ?? 'Firebase error',
        timestamp: new Date().toISOString(),
      };
    }
    return {
      success: false,
      code: CloudFunctionErrorCode.INTERNAL_ERROR,
      message: err instanceof Error ? err.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }

  private isFirebaseError(err: unknown): err is { code: string; message: string } {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as Record<string, unknown>)['code'] === 'string'
    );
  }
}
