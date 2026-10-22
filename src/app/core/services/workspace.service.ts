import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  doc,
  docData,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionData,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { switchMap, of, from } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Workspace, PublicWorkspaceDirectory } from '../models/workspace.model';
import { AuthService } from '../../services/auth.service';
import { StorageService } from './storage.service';
import { upload } from '@imagekit/angular';
import {
  CreateWorkspaceDto,
  CreateWorkspaceResponseData,
  UpdateWorkspaceDto,
} from '../dtos/workspace.dto';
import { environment } from '../../../environments/environment';
import { CloudFunctionResult } from '../dtos/cloud-function.dto';
import {
  WorkspacePlan,
  WorkspaceStatus,
  WorkspaceRole,
  CalendarViewMode,
  ThemeMode,
} from '../models/enums';
import {
  PublicCalendarAccess,
  WorkspaceSettings,
  WorkspaceAccessApprovalStatus,
} from '../models/workspace.model';
import {
  getCurrencySymbol,
  isCurrencyCode,
  normalizeCurrencyCodes,
} from '../models/currencies';
import { WorkspaceMember } from '../models/workspace-member.model';

export interface WorkspaceSwitchItem {
  workspaceId: string;
  name: string;
  plan: WorkspacePlan;
  role: WorkspaceRole;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private firestore = inject(Firestore);
  private auth      = inject(AuthService);
  private storage   = inject(StorageService);

  private readonly STORAGE_KEY_PREFIX = 'sm_active_workspace:';
  private readonly FREE_WORKSPACE_LIMIT = 1;
  private readonly PRO_WORKSPACE_LIMIT = 3;
  private lastAutoSyncedWorkspaceId = signal<string | null>(null);

  // ── Active workspace selection ──────────────────────────────────────────────

  activeWorkspaceId = signal<string | null>(null);

  selectWorkspace(workspaceId: string): void {
    const userId = this.auth.getCurrentUser()?.uid;
    this.activeWorkspaceId.set(workspaceId);
    if (userId) {
      localStorage.setItem(this.storageKey(userId), workspaceId);
    }
  }

  clearActiveWorkspace(): void {
    const userId = this.auth.getCurrentUser()?.uid;
    this.activeWorkspaceId.set(null);
    this.lastAutoSyncedWorkspaceId.set(null);
    if (userId) {
      localStorage.removeItem(this.storageKey(userId));
    }
  }

  // ── Real-time workspace document ────────────────────────────────────────────

  workspace$ = toSignal(
    this.activeWorkspaceIdAsObservable().pipe(
      switchMap((id) => this.auth.user$.pipe(
        switchMap((user) => {
          if (!id || !user) return of(null);
          return docData<Workspace>(
            doc(this.firestore, `workspaces/${id}`) as any,
            { idField: 'workspaceId' },
          ).pipe(
            // If the active workspace ID in local storage belongs to another account
            // or membership was removed, avoid surfacing noisy permission errors.
            catchError(() => of(null)),
          );
        }),
      )),
    ),
    { initialValue: null },
  );

  timezone        = computed(() => this.workspace$()?.timezone         ?? 'UTC');
  currency        = computed(() => this.workspace$()?.currency         ?? 'USD');
  currencySymbol  = computed(() => getCurrencySymbol(this.currency()));
  paymentMethods = computed(() => {
    const methods = this.workspace$()?.paymentMethods ?? [];
    const normalized = ['Cash', ...methods.filter((method) => method !== 'Cash')];
    return normalized.length ? normalized : ['Cash'];
  });
  calendarView = computed(() => this.workspace$()?.calendarView     ?? CalendarViewMode.MONTH);
  weekViewStartHour = computed(() => this.workspace$()?.weekViewStartHour ?? 0);
  weekViewEndHour   = computed(() => this.workspace$()?.weekViewEndHour   ?? 24);
  workspaceSettings = computed<WorkspaceSettings>(() => {
    return this.normalizeWorkspaceSettings(this.workspace$()?.workspaceSettings);
  });
  workspaceTheme = computed<ThemeMode | null>(() => {
    return this.workspaceSettings().theme ?? null;
  });
  readonly workspaceBrandLogoUrl = computed(() => this.workspaceLogoUrl(this.workspace$()));
  isPublicCalendarEnabled = computed(() => this.workspaceSettings().publicCalendarAccess === 'BUSY_ONLY');
  publicBookingRequiresApproval = computed(() => this.isPublicCalendarEnabled());

  constructor() {
    this.auth.user$.subscribe((user) => {
      const userId = user?.uid ?? null;
      const workspaceId = userId ? localStorage.getItem(this.storageKey(userId)) : null;
      this.activeWorkspaceId.set(workspaceId);

      if (!workspaceId) {
        this.lastAutoSyncedWorkspaceId.set(null);
      }
    });

    effect(() => {
      const workspace = this.workspace$();
      if (!workspace) return;
      if (!this.auth.getCurrentUser()) return;

      const currentId = workspace.workspaceId;
      if (this.lastAutoSyncedWorkspaceId() === currentId) return;

      this.lastAutoSyncedWorkspaceId.set(currentId);
      void this.syncPublicWorkspaceDirectoryFromWorkspace(currentId);
    });
  }

  listPublicDirectory() {
    const col = collection(this.firestore, 'publicWorkspaces');
    return collectionData<PublicWorkspaceDirectory>(col as any, { idField: 'workspaceId' }).pipe(
      map((items: PublicWorkspaceDirectory[]) =>
        [...items].sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }

  listPendingApprovals() {
    const workspacesCol = collection(this.firestore, 'workspaces');
    return collectionData<Workspace>(
      query(workspacesCol, where('accessApprovalStatus', '==', 'PENDING_PAYMENT')) as any,
      { idField: 'workspaceId' },
    ).pipe(
      map((items) => [...items].sort((a, b) => this.getTimestampMillis(b.paymentSubmittedAt) - this.getTimestampMillis(a.paymentSubmittedAt))),
    );
  }

  async approveWorkspaceAccess(workspaceId: string): Promise<void> {
    const ref = doc(this.firestore, `workspaces/${workspaceId}`);
    await updateDoc(ref, {
      accessApprovalStatus: 'APPROVED' as WorkspaceAccessApprovalStatus,
      onboardingCompleted: true,
      accessApprovedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  getPublicDirectoryEntry(workspaceId: string) {
    if (!workspaceId) return of(null);

    const ref = doc(this.firestore, this.publicDirectoryDocPath(workspaceId));
    return docData<PublicWorkspaceDirectory>(ref as any).pipe(
      map((entry) => {
        if (!entry) return null;
        return {
          ...entry,
          workspaceId,
        } as PublicWorkspaceDirectory;
      }),
      catchError(() => of(null)),
    );
  }

  async republishPublicWorkspaceDirectory(workspaceId: string): Promise<void> {
    await this.syncPublicWorkspaceDirectoryFromWorkspace(workspaceId);
  }

  listAccessibleWorkspaces() {
    return this.auth.user$.pipe(
      switchMap((user) => {
        if (!user?.uid) return of([] as WorkspaceSwitchItem[]);

        const membersCol = collection(this.firestore, 'workspaceMembers');
        const memberQuery = query(
          membersCol,
          where('userId', '==', user.uid),
          where('isActive', '==', true),
        );

        return collectionData<WorkspaceMember>(memberQuery as any).pipe(
          switchMap((members) => {
            if (!members.length) return of([] as WorkspaceSwitchItem[]);

            const loads = members.map(async (member) => {
              const workspaceSnap = await getDoc(
                doc(this.firestore, `workspaces/${member.workspaceId}`) as any,
              );
              if (!workspaceSnap.exists()) return null;

              const workspace = workspaceSnap.data() as Workspace;
              return {
                workspaceId: workspace.workspaceId,
                name: workspace.name,
                plan: this.normalizePlan(workspace.plan),
                role: member.role,
              } as WorkspaceSwitchItem;
            });

            return from(Promise.all(loads)).pipe(
              map((items) => items
                .filter((item): item is WorkspaceSwitchItem => !!item)
                .sort((a, b) => a.name.localeCompare(b.name))),
            );
          }),
          catchError(() => of([] as WorkspaceSwitchItem[])),
        );
      }),
    );
  }

  isWorkspaceAccessApproved(workspace: Workspace | null | undefined): boolean {
    if (!workspace) return false;

    const status = this.normalizeAccessApprovalStatus(workspace.accessApprovalStatus);
    if (status === 'APPROVED' || status === 'NOT_REQUIRED') {
      return true;
    }

    return false;
  }

  async markPaymentSubmitted(workspaceId: string): Promise<void> {
    if (!workspaceId) return;
    const ref = doc(this.firestore, `workspaces/${workspaceId}`);
    await updateDoc(ref, {
      paymentSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  maxOwnedWorkspacesForPlan(plan: WorkspacePlan): number | null {
    if (plan === WorkspacePlan.FREE) return this.FREE_WORKSPACE_LIMIT;
    if (plan === WorkspacePlan.PRO) return this.PRO_WORKSPACE_LIMIT;
    return null;
  }

  // ── Operations ──────────────────────────────────────────────────────────────

  /**
   * Create a new workspace directly in Firestore.
   * Writes two documents atomically:
   *   1. /workspaces/{id}         — the workspace root
   *   2. /workspaceMembers/{uid}_{id} — the founding OWNER membership
   */
  async create(
    dto: CreateWorkspaceDto,
  ): Promise<CloudFunctionResult<CreateWorkspaceResponseData>> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) {
        return {
          success: false,
          code: 'UNAUTHORIZED' as any,
          message: 'You must be signed in to create a workspace.',
          timestamp: new Date().toISOString(),
        };
      }

      // 1. Create the workspace document with a pre-generated ID
      const wsRef = doc(collection(this.firestore, 'workspaces'));
      const requestedPlan = this.normalizePlan(dto.plan);
      const activeWorkspaceCount = await this.countActiveWorkspacesForUser(user.uid);
      const entitlementPlan = activeWorkspaceCount > 0
        ? this.normalizePlan(this.workspace$()?.plan)
        : requestedPlan;

      if (entitlementPlan === WorkspacePlan.FREE && activeWorkspaceCount >= this.FREE_WORKSPACE_LIMIT) {
        return {
          success: false,
          code: 'FORBIDDEN' as any,
          message: 'Free plan allows only one workspace. Upgrade your plan to create more workspaces.',
          timestamp: new Date().toISOString(),
        };
      }

      const plan = requestedPlan;
      const requiresApproval = plan !== WorkspacePlan.FREE;
      if (entitlementPlan === WorkspacePlan.PRO && activeWorkspaceCount >= this.PRO_WORKSPACE_LIMIT) {
        return {
          success: false,
          code: 'FORBIDDEN' as any,
          message: 'Pro plan allows up to 3 workspaces. Upgrade to Enterprise to create more workspaces.',
          timestamp: new Date().toISOString(),
        };
      }

      const currency = this.normalizeCurrency(dto.currency) ?? 'USD';
      const supportedCurrencies = this.normalizeSupportedCurrencies(dto.supportedCurrencies, currency);
      await setDoc(wsRef, {
        workspaceId:  wsRef.id,
        name:         dto.name,
        businessType: this.normalizeBusinessType(dto.businessType),
        slug:         null,
        ownerId:      user.uid,
        logoUrl:      null,
        timezone:     dto.timezone,
        currency,
        supportedCurrencies,
        paymentMethods: dto.paymentMethods?.length ? dto.paymentMethods : ['Cash'],
        calendarView:      dto.calendarView      ?? CalendarViewMode.MONTH,
        weekViewStartHour: dto.weekViewStartHour  ?? 8,
        weekViewEndHour:   dto.weekViewEndHour    ?? 22,
        workspaceSettings: dto.workspaceSettings ?? this.defaultWorkspaceSettings(),
        phone:        dto.phone    ?? null,
        whishNumber:  this.normalizeWhishNumber(dto.whishNumber),
        address:      dto.address  ?? null,
        latitude:     this.normalizeLatitude(dto.latitude),
        longitude:    this.normalizeLongitude(dto.longitude),
        websiteUrl:   this.normalizeUrl(dto.websiteUrl),
        instagramUrl: this.normalizeUrl(dto.instagramUrl),
        facebookUrl:  this.normalizeUrl(dto.facebookUrl),
        tiktokUrl:    this.normalizeUrl(dto.tiktokUrl),
        accessApprovalStatus: requiresApproval
          ? ('PENDING_PAYMENT' as WorkspaceAccessApprovalStatus)
          : ('NOT_REQUIRED' as WorkspaceAccessApprovalStatus),
        onboardingCompleted: !requiresApproval,
        paymentSubmittedAt: null,
        accessApprovedAt: null,
        plan,
        status:       WorkspaceStatus.ACTIVE,
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
      });

      await this.syncPublicWorkspaceDirectoryFromWorkspace(wsRef.id);

      // 2. Create the founding OWNER membership document
      const memberDocId = `${user.uid}_${wsRef.id}`;
      await setDoc(doc(this.firestore, `workspaceMembers/${memberDocId}`), {
        userId:      user.uid,
        workspaceId: wsRef.id,
        role:        WorkspaceRole.OWNER,
        displayName: user.displayName ?? user.email ?? 'Owner',
        email:       user.email ?? '',
        photoUrl:    user.photoURL ?? null,
        invitedBy:   null,
        joinedAt:    serverTimestamp(),
        updatedAt:   serverTimestamp(),
        isActive:    true,
      });

      this.selectWorkspace(wsRef.id);

      return {
        success: true,
        data: { workspaceId: wsRef.id },
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'INTERNAL_ERROR' as any,
        message: err?.message ?? 'Failed to create workspace.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /** Update workspace metadata fields. OWNER only (enforced by Firestore rules). */
  async update(dto: UpdateWorkspaceDto): Promise<void> {
    const { workspaceId, ...fields } = dto;
    const ref = doc(this.firestore, `workspaces/${workspaceId}`);
    const payload: Record<string, unknown> = {
      ...fields,
      updatedAt: serverTimestamp(),
    };

    if (this.hasOwn(fields, 'latitude')) {
      payload['latitude'] = this.normalizeLatitude(fields.latitude);
    }

    if (this.hasOwn(fields, 'longitude')) {
      payload['longitude'] = this.normalizeLongitude(fields.longitude);
    }

    if (this.hasOwn(fields, 'websiteUrl')) {
      payload['websiteUrl'] = this.normalizeUrl(fields.websiteUrl);
    }

    if (this.hasOwn(fields, 'whishNumber')) {
      payload['whishNumber'] = this.normalizeWhishNumber(fields.whishNumber);
    }

    if (this.hasOwn(fields, 'instagramUrl')) {
      payload['instagramUrl'] = this.normalizeUrl(fields.instagramUrl);
    }

    if (this.hasOwn(fields, 'facebookUrl')) {
      payload['facebookUrl'] = this.normalizeUrl(fields.facebookUrl);
    }

    if (this.hasOwn(fields, 'tiktokUrl')) {
      payload['tiktokUrl'] = this.normalizeUrl(fields.tiktokUrl);
    }

    if (this.hasOwn(fields, 'businessType')) {
      payload['businessType'] = this.normalizeBusinessType(fields.businessType);
    }

    const hasCurrency = this.hasOwn(fields, 'currency');
    const hasSupportedCurrencies = this.hasOwn(fields, 'supportedCurrencies');
    if (this.hasOwn(fields, 'plan')) {
      payload['plan'] = this.normalizePlan(fields.plan);
    }

    if (hasCurrency || hasSupportedCurrencies) {
      const normalizedCurrency = this.normalizeCurrency(fields.currency);
      const fallback = normalizedCurrency ?? this.currency();
      const normalizedSupported = this.normalizeSupportedCurrencies(fields.supportedCurrencies, fallback);
      payload['currency'] = normalizedCurrency ?? normalizedSupported[0] ?? fallback;
      payload['supportedCurrencies'] = normalizedSupported.length
        ? normalizedSupported
        : [payload['currency'] as string];
    }

    await updateDoc(ref, payload);
    await this.syncPublicWorkspaceDirectoryFromWorkspace(workspaceId);
  }

  /** Upload a workspace logo using signed ImageKit upload parameters from environment config. */
  async uploadLogo(workspaceId: string, file: File): Promise<string> {
    const imageKitConfig = environment.imageKit ?? {};
    const { publicKey, token, signature, expire } = imageKitConfig;

    if (!publicKey || !token || !signature || !expire) {
      throw new Error('ImageKit upload is not configured. Provide publicKey, token, signature, and expire in the app environment.');
    }

    const response = await upload({
      file,
      fileName: file.name,
      folder: `workspaces/${workspaceId}/logos`,
      publicKey,
      token,
      signature,
      expire: Number(expire),
    });

    const nextUrl = this.normalizeLogoUrl((response as { url?: string | null } | null)?.url ?? null);
    if (!nextUrl) {
      throw new Error('ImageKit upload did not return a valid logo URL.');
    }

    return nextUrl;
  }

  workspaceLogoUrl(workspace: Workspace | { logoUrl?: string | null } | null | undefined): string | null {
    const raw = workspace?.logoUrl ?? null;
    return this.normalizeLogoUrl(raw);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────
  private activeWorkspaceIdAsObservable() {
    return toObservable(this.activeWorkspaceId);
  }

  private storageKey(userId: string): string {
    return `${this.STORAGE_KEY_PREFIX}${userId}`;
  }

  private defaultWorkspaceSettings(): WorkspaceSettings {
    return {
      theme: ThemeMode.LIGHT,
      publicCalendarAccess: 'PRIVATE' as PublicCalendarAccess,
      operatingRules: {
        // Monday through Friday
        workingDays: [1, 2, 3, 4, 5],
        blockedDays: [],
        blockedHours: [],
      },
    };
  }

  private normalizeWorkspaceSettings(settings: WorkspaceSettings | undefined): WorkspaceSettings {
    const fallback = this.defaultWorkspaceSettings();
    if (!settings) return fallback;
    const access = this.normalizePublicCalendarAccess(settings.publicCalendarAccess);

    return {
      theme: settings.theme ?? fallback.theme,
      publicCalendarAccess: access,
      operatingRules: {
        workingDays: settings.operatingRules?.workingDays?.length
          ? settings.operatingRules.workingDays
          : fallback.operatingRules.workingDays,
        blockedDays: settings.operatingRules?.blockedDays ?? fallback.operatingRules.blockedDays,
        blockedHours: settings.operatingRules?.blockedHours ?? fallback.operatingRules.blockedHours,
      },
    };
  }

  private async syncPublicWorkspaceDirectoryFromWorkspace(workspaceId: string): Promise<void> {
    const snap = await getDoc(doc(this.firestore, `workspaces/${workspaceId}`) as any);
    if (!snap.exists()) {
      await deleteDoc(doc(this.firestore, this.publicDirectoryDocPath(workspaceId))).catch(() => undefined);
      return;
    }

    const workspace = snap.data() as Workspace;
    const settings = this.normalizeWorkspaceSettings(workspace.workspaceSettings);
    const publicRef = doc(this.firestore, this.publicDirectoryDocPath(workspaceId));

    if (settings.publicCalendarAccess !== 'BUSY_ONLY') {
      await deleteDoc(publicRef).catch(() => undefined);
      return;
    }

    await setDoc(publicRef, {
      workspaceId,
      name: workspace.name,
      businessType: this.normalizeBusinessType(workspace.businessType),
      timezone: workspace.timezone,
      currency: workspace.currency,
      address: workspace.address ?? null,
      phone: workspace.phone ?? null,
      whishNumber: this.normalizeWhishNumber(workspace.whishNumber),
      latitude: this.normalizeLatitude(workspace.latitude),
      longitude: this.normalizeLongitude(workspace.longitude),
      websiteUrl: this.normalizeUrl(workspace.websiteUrl),
      instagramUrl: this.normalizeUrl(workspace.instagramUrl),
      facebookUrl: this.normalizeUrl(workspace.facebookUrl),
      tiktokUrl: this.normalizeUrl(workspace.tiktokUrl),
      logoUrl: workspace.logoUrl ?? null,
      publicBookingPath: `/book/${workspaceId}`,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  private publicDirectoryDocPath(workspaceId: string): string {
    return `publicWorkspaces/${workspaceId}`;
  }

  private normalizePublicCalendarAccess(value: unknown): PublicCalendarAccess {
    const raw = String(value ?? '').trim().toUpperCase();

    // Legacy/public aliases from earlier iterations are treated as BUSY_ONLY.
    if (
      raw === 'BUSY_ONLY'
      || raw === 'FULL_DETAILS'
      || raw === 'PUBLIC'
      || raw === 'BUSY_SLOT_ONLY'
      || raw === 'BUSY_SLOTS_ONLY'
      || raw === 'OPEN'
      || raw === 'TRUE'
    ) {
      return 'BUSY_ONLY';
    }

    return 'PRIVATE';
  }

  private normalizeUrl(value: string | null | undefined): string | null {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  }

  private normalizeLogoUrl(value: string | null | undefined): string | null {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  private normalizeCurrency(value: unknown): string | null {
    return isCurrencyCode(value) ? value : null;
  }

  private normalizeSupportedCurrencies(input: unknown, fallbackCurrency: string): string[] {
    const normalized = normalizeCurrencyCodes(input);
    if (!normalized.length) {
      return [fallbackCurrency];
    }

    if (!normalized.includes(fallbackCurrency)) {
      return [fallbackCurrency, ...normalized];
    }

    return normalized;
  }

  private normalizePlan(value: unknown): WorkspacePlan {
    if (value === WorkspacePlan.PRO || value === WorkspacePlan.ENTERPRISE) {
      return value;
    }
    return WorkspacePlan.FREE;
  }

  private normalizeAccessApprovalStatus(value: unknown): WorkspaceAccessApprovalStatus {
    const raw = String(value ?? '').trim().toUpperCase();
    if (raw === 'APPROVED') return 'APPROVED';
    if (raw === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
    if (raw === 'NOT_REQUIRED') return 'NOT_REQUIRED';
    return 'NOT_REQUIRED';
  }

  private async countActiveWorkspacesForUser(userId: string): Promise<number> {
    const membersCol = collection(this.firestore, 'workspaceMembers');
    const snapshot = await getDocs(query(
      membersCol,
      where('userId', '==', userId),
      where('role', '==', WorkspaceRole.OWNER),
      where('isActive', '==', true),
    ) as any);
    return snapshot.size;
  }

  private hasOwn(obj: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  private normalizeLatitude(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num < -90 || num > 90) {
      return null;
    }
    return num;
  }

  private normalizeLongitude(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num < -180 || num > 180) {
      return null;
    }
    return num;
  }

  private normalizeWhishNumber(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    // Preserve a leading plus, drop spacing/punctuation for stable links/search.
    const hasPlus = raw.startsWith('+');
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      return null;
    }

    return hasPlus ? `+${digits}` : digits;
  }

  private normalizeBusinessType(value: unknown): string {
    const raw = String(value ?? '').trim();
    return raw || 'Other';
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
}
