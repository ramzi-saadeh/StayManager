import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { WorkspaceMember } from '../models/workspace-member.model';
import { AuthService } from '../../services/auth.service';
import { CloudFunctionResult } from '../dtos/cloud-function.dto';
import {
  InviteMemberDto,
  InviteMemberResponseData,
  UpdateMemberRoleDto,
  RevokeMemberDto,
} from '../dtos/member.dto';
import { InvitableRole } from '../models/invitation.model';
import { UserProfile } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private firestore = inject(Firestore);
  private auth      = inject(AuthService);

  // ── Reads ───────────────────────────────────────────────────────────────────

  listActive(workspaceId: string): Observable<WorkspaceMember[]> {
    const col = collection(this.firestore, 'workspaceMembers');
    return collectionData<WorkspaceMember>(
      query(
        col,
        where('workspaceId', '==', workspaceId),
        where('isActive', '==', true),
      ) as any,
    ).pipe(
      map((members) => this.sortMembersByJoinedAt(members)),
    ) as Observable<WorkspaceMember[]>;
  }

  listAll(workspaceId: string): Observable<WorkspaceMember[]> {
    const col = collection(this.firestore, 'workspaceMembers');
    return collectionData<WorkspaceMember>(
      query(
        col,
        where('workspaceId', '==', workspaceId),
      ) as any,
    ).pipe(
      map((members) => this.sortMembersByJoinedAt(members)),
    ) as Observable<WorkspaceMember[]>;
  }

  listMyWorkspaces(userId: string): Observable<WorkspaceMember[]> {
    const col = collection(this.firestore, 'workspaceMembers');
    return collectionData<WorkspaceMember>(
      query(
        col,
        where('userId', '==', userId),
        where('isActive', '==', true),
      ) as any,
    ).pipe(
      map((members) => this.sortMembersByJoinedAt(members, 'desc')),
    ) as Observable<WorkspaceMember[]>;
  }

  // ── Writes (direct Firestore) ───────────────────────────────────────────────

  /**
   * Add a member directly to the workspace.
   * NOTE: No email invite flow without Cloud Functions. The invitee must already
   * have a Firebase Auth account. Share the workspaceId with them out-of-band.
   */
  async invite(dto: InviteMemberDto): Promise<CloudFunctionResult<InviteMemberResponseData>> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const email = dto.email.trim();
      if (!email) {
        return {
          success: false,
          code: 'VALIDATION_ERROR' as any,
          message: 'Email is required.',
          timestamp: new Date().toISOString(),
        };
      }

      const profile = await this.findUserByEmail(email);
      if (!profile) {
        return {
          success: false,
          code: 'INVITATION_NOT_FOUND' as any,
          message: 'No user found with this email. Ask them to register first.',
          timestamp: new Date().toISOString(),
        };
      }

      const memberDocId = `${profile.uid}_${dto.workspaceId}`;
      const memberRef = doc(this.firestore, `workspaceMembers/${memberDocId}`);
      const memberSnap = await getDoc(memberRef as any);
      const existing = memberSnap.data() as WorkspaceMember | undefined;
      if (existing?.isActive === true) {
        return {
          success: false,
          code: 'MEMBER_ALREADY_EXISTS' as any,
          message: 'This user is already an active member of the workspace.',
          timestamp: new Date().toISOString(),
        };
      }

      const addResult = await this.addMemberById(
        dto.workspaceId,
        profile.uid,
        profile.displayName,
        profile.email,
        dto.role,
      );

      if (!addResult.success) {
        return {
          success: false,
          code: addResult.code,
          message: addResult.message,
          timestamp: addResult.timestamp,
        };
      }

      return {
        success: true,
        data: { invitationId: memberDocId },
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to invite member.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Directly add a known user (by UID) to a workspace.
   * Use this as the invite replacement when Cloud Functions are not available.
   */
  async addMemberById(
    workspaceId: string,
    userId: string,
    displayName: string,
    email: string,
    role: InvitableRole,
  ): Promise<CloudFunctionResult> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) throw new Error('Not authenticated');

      const memberDocId = `${userId}_${workspaceId}`;
      await setDoc(doc(this.firestore, `workspaceMembers/${memberDocId}`), {
        userId,
        workspaceId,
        role,
        displayName,
        email,
        photoUrl:    null,
        invitedBy:   user.uid,
        joinedAt:    serverTimestamp(),
        updatedAt:   serverTimestamp(),
        isActive:    true,
      });

      return { success: true, data: undefined as never, timestamp: new Date().toISOString() };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to add member.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /** Update a member's role directly in Firestore. */
  async updateRole(dto: UpdateMemberRoleDto): Promise<CloudFunctionResult> {
    try {
      const memberDocId = `${dto.userId}_${dto.workspaceId}`;
      await updateDoc(doc(this.firestore, `workspaceMembers/${memberDocId}`), {
        role:      dto.role,
        updatedAt: serverTimestamp(),
      });
      return { success: true, data: undefined as never, timestamp: new Date().toISOString() };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to update role.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /** Revoke a member's access (sets isActive = false). */
  async revoke(dto: RevokeMemberDto): Promise<CloudFunctionResult> {
    try {
      const memberDocId = `${dto.userId}_${dto.workspaceId}`;
      await updateDoc(doc(this.firestore, `workspaceMembers/${memberDocId}`), {
        isActive:  false,
        updatedAt: serverTimestamp(),
      });
      return { success: true, data: undefined as never, timestamp: new Date().toISOString() };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to revoke member.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private sortMembersByJoinedAt(
    members: WorkspaceMember[],
    direction: 'asc' | 'desc' = 'asc',
  ): WorkspaceMember[] {
    const multiplier = direction === 'asc' ? 1 : -1;
    return [...members].sort((a, b) => {
      const aMillis = this.getTimestampMillis(a.joinedAt);
      const bMillis = this.getTimestampMillis(b.joinedAt);
      return (aMillis - bMillis) * multiplier;
    });
  }

  private getTimestampMillis(value: unknown): number {
    if (value && typeof value === 'object' && 'toMillis' in (value as object)) {
      const fn = (value as { toMillis?: () => number }).toMillis;
      if (typeof fn === 'function') {
        return fn.call(value as { toMillis: () => number });
      }
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    return 0;
  }

  private async findUserByEmail(email: string): Promise<UserProfile | null> {
    const usersCol = collection(this.firestore, 'users');
    const normalizedEmail = email.trim().toLowerCase();
    const candidates = [email.trim()];
    if (normalizedEmail !== email.trim()) {
      candidates.push(normalizedEmail);
    }

    for (const candidate of candidates) {
      // limit(1) is required by the security rules for user lookups.
      const snapshot = await getDocs(query(usersCol, where('email', '==', candidate), limit(1)) as any);
      if (snapshot.empty) {
        continue;
      }

      const found = snapshot.docs[0]?.data() as UserProfile | undefined;
      if (found?.uid) {
        return found;
      }
    }

    return null;
  }
}
