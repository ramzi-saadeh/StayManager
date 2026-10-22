import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { from, firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
} from '@angular/fire/firestore';
import { Auth, user as authUser, idToken } from '@angular/fire/auth';
import { WorkspaceService } from '../core/services/workspace.service';
import { WorkspaceMember } from '../core/models/workspace-member.model';
import { Workspace } from '../core/models/workspace.model';
import { UserRepository } from '../core/services/user.repository';

/**
 * workspaceGuard — runs after authGuard.
 *
 * Uses getDocs (one-shot read) instead of a real-time listener so there's no
 * race between the Firestore connection and the Angular router resolution.
 * Retries once with a short delay if the first read gets a permissions error
 * (can happen in the ~200 ms window right after signInWithEmailAndPassword
 * before the refreshed token is fully propagated to the Firestore SDK).
 */
export const workspaceGuard = () => {
  const firestore = inject(Firestore);
  const fbAuth    = inject(Auth);
  const workspace = inject(WorkspaceService);
  const userRepo  = inject(UserRepository);
  const router    = inject(Router);

  function isPermissionDeniedError(err: any): boolean {
    const code = err?.code as string | undefined;
    return code === 'permission-denied'
      || code === 'firestore/permission-denied'
      || String(err?.message ?? '').toLowerCase().includes('missing or insufficient permissions');
  }

  async function fetchWorkspaces(uid: string): Promise<WorkspaceMember[]> {
    const col = collection(firestore, 'workspaceMembers');
    const q   = query(
      col,
      where('userId',   '==', uid),
      where('isActive', '==', true),
      orderBy('joinedAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WorkspaceMember);
  }

  async function fetchWorkspaceDoc(workspaceId: string): Promise<Workspace | null> {
    const snap = await getDoc(doc(firestore, `workspaces/${workspaceId}`) as any);
    if (!snap.exists()) return null;
    return snap.data() as Workspace;
  }

  async function resolveAuthUser() {
    const current = fbAuth.currentUser;
    if (current) return current;

    return firstValueFrom(
      authUser(fbAuth).pipe(
        filter((u): u is NonNullable<typeof u> => !!u),
        take(1),
      ),
    );
  }

  async function waitForAuthToken(): Promise<void> {
    await firstValueFrom(
      idToken(fbAuth).pipe(
        filter((token): token is string => !!token),
        take(1),
      ),
    );
  }

  async function resolve() {
    const user = await resolveAuthUser();
    if (!user) return router.createUrlTree(['/login']);

    const profile = await firstValueFrom(userRepo.get(user.uid).pipe(take(1)));
    const isOwner = profile?.role === 'owner';

    // Ensure guard runs with a fresh token from the actual signed-in user.
    await user.getIdToken(true);
    await waitForAuthToken();

    let list: WorkspaceMember[] = [];
    let lastErr: any;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        list = await fetchWorkspaces(user.uid);
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        if (!isPermissionDeniedError(err)) {
          console.error('[workspaceGuard] unexpected error:', err?.message);
          return router.createUrlTree(['/onboarding']);
        }

        // Backoff + force refresh to handle token propagation after account switch.
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
        await user.getIdToken(true);
        await waitForAuthToken();
      }
    }

    if (isPermissionDeniedError(lastErr)) {
      console.error('[workspaceGuard] permission retry failed:', lastErr?.message);
      return router.createUrlTree(['/onboarding']);
    }

    if (!list.length) {
      if (isOwner) return router.createUrlTree(['/onboarding']);
      return router.createUrlTree(['/my-reservations']);
    }

    const persisted = workspace.activeWorkspaceId();
    const candidateIds = [
      ...(persisted && list.some((m) => m.workspaceId === persisted) ? [persisted] : []),
      ...list.map((m) => m.workspaceId),
    ].filter((id, index, arr) => arr.indexOf(id) === index);

    let pendingWorkspaceId: string | null = null;

    for (const workspaceId of candidateIds) {
      const ws = await fetchWorkspaceDoc(workspaceId);
      if (!ws) continue;

      if (workspace.isWorkspaceAccessApproved(ws)) {
        if (workspace.activeWorkspaceId() !== workspaceId) {
          workspace.selectWorkspace(workspaceId);
        }
        return true;
      }

      if (!pendingWorkspaceId) {
        pendingWorkspaceId = workspaceId;
      }
    }

    if (pendingWorkspaceId) {
      if (!isOwner) {
        return true;
      }
      workspace.selectWorkspace(pendingWorkspaceId);
      return router.createUrlTree(['/activation-pending']);
    }

    if (isOwner) {
      return router.createUrlTree(['/onboarding']);
    }

    return true;
  }

  return from(resolve());
};
