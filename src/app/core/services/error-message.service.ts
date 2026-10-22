import { Injectable } from '@angular/core';
import { CloudFunctionErrorCode } from '../dtos/cloud-function.dto';

/**
 * Maps CloudFunctionErrorCode values to i18n keys.
 * Components inject this service to get a user-facing message
 * without coupling to translation keys inline.
 */
@Injectable({ providedIn: 'root' })
export class ErrorMessageService {
  /** Returns the i18n key for a given CloudFunctionErrorCode. */
  toI18nKey(code: CloudFunctionErrorCode): string {
    const map: Record<CloudFunctionErrorCode, string> = {
      [CloudFunctionErrorCode.UNAUTHORIZED]:                'ERROR.UNAUTHORIZED',
      [CloudFunctionErrorCode.FORBIDDEN]:                   'ERROR.FORBIDDEN',
      [CloudFunctionErrorCode.RESERVATION_CONFLICT]:        'ERROR.RESERVATION_CONFLICT',
      [CloudFunctionErrorCode.RESERVATION_NOT_FOUND]:       'ERROR.NOT_FOUND',
      [CloudFunctionErrorCode.INVALID_STATUS_TRANSITION]:   'ERROR.INVALID_STATUS_TRANSITION',
      [CloudFunctionErrorCode.WORKSPACE_NOT_FOUND]:         'ERROR.NOT_FOUND',
      [CloudFunctionErrorCode.WORKSPACE_SUSPENDED]:         'ERROR.WORKSPACE_SUSPENDED',
      [CloudFunctionErrorCode.RESOURCE_NOT_FOUND]:          'ERROR.NOT_FOUND',
      [CloudFunctionErrorCode.RESOURCE_INACTIVE]:           'ERROR.RESOURCE_INACTIVE',
      [CloudFunctionErrorCode.RESOURCE_BOOKING_MODE_IMMUTABLE]: 'ERROR.IMMUTABLE_FIELD',
      [CloudFunctionErrorCode.OUTSIDE_AVAILABILITY]:        'ERROR.OUTSIDE_AVAILABILITY',
      [CloudFunctionErrorCode.BLOCKED_PERIOD_CONFLICT]:     'ERROR.BLOCKED_PERIOD',
      [CloudFunctionErrorCode.BELOW_MIN_DURATION]:          'ERROR.BELOW_MIN_DURATION',
      [CloudFunctionErrorCode.EXCEEDS_MAX_DURATION]:        'ERROR.EXCEEDS_MAX_DURATION',
      [CloudFunctionErrorCode.INVITATION_NOT_FOUND]:        'ERROR.NOT_FOUND',
      [CloudFunctionErrorCode.INVITATION_EXPIRED]:          'ERROR.INVITATION_EXPIRED',
      [CloudFunctionErrorCode.INVITATION_ALREADY_ACCEPTED]: 'ERROR.INVITATION_USED',
      [CloudFunctionErrorCode.MEMBER_ALREADY_EXISTS]:       'ERROR.MEMBER_EXISTS',
      [CloudFunctionErrorCode.CANNOT_MODIFY_OWNER]:         'ERROR.CANNOT_MODIFY_OWNER',
      [CloudFunctionErrorCode.VALIDATION_ERROR]:            'ERROR.VALIDATION',
      [CloudFunctionErrorCode.INTERNAL_ERROR]:              'ERROR.INTERNAL',
    };
    return map[code] ?? 'ERROR.INTERNAL';
  }
}
