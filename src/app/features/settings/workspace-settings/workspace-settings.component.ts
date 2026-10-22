import { Component, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AppLanguage, LanguageService } from '../../../core/services/language.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ResourceRepository } from '../../../core/services/resource.repository';
import { ReservationRepository } from '../../../core/services/reservation.repository';
import { AuthService } from '../../../services/auth.service';
import { CalendarViewMode, ThemeMode, WorkspacePlan } from '../../../core/models/enums';
import { CURRENCIES, normalizeCurrencyCodes } from '../../../core/models/currencies';
import { workspaceBusinessTypes } from '../../../core/mock/public-workspaces.mock';
import { DayOfWeek } from '../../../core/models/availability.model';
import {
  PublicCalendarAccess,
  WorkspaceOperatingRules,
} from '../../../core/models/workspace.model';

const PLAN_RANK: Record<WorkspacePlan, number> = {
  [WorkspacePlan.FREE]: 0,
  [WorkspacePlan.PRO]: 1,
  [WorkspacePlan.ENTERPRISE]: 2,
};

const TIMEZONES = [
  'Asia/Beirut', 'Asia/Amman', 'Asia/Dubai', 'Asia/Riyadh'];

const DAYS: ReadonlyArray<{ value: DayOfWeek; shortKey: string; fullKey: string }> = [
  { value: 0, shortKey: 'WORKSPACE_SETTINGS.DAYS.SUN_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.SUNDAY' },
  { value: 1, shortKey: 'WORKSPACE_SETTINGS.DAYS.MON_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.MONDAY' },
  { value: 2, shortKey: 'WORKSPACE_SETTINGS.DAYS.TUE_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.TUESDAY' },
  { value: 3, shortKey: 'WORKSPACE_SETTINGS.DAYS.WED_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.WEDNESDAY' },
  { value: 4, shortKey: 'WORKSPACE_SETTINGS.DAYS.THU_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.THURSDAY' },
  { value: 5, shortKey: 'WORKSPACE_SETTINGS.DAYS.FRI_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.FRIDAY' },
  { value: 6, shortKey: 'WORKSPACE_SETTINGS.DAYS.SAT_SHORT', fullKey: 'WORKSPACE_SETTINGS.DAYS.SATURDAY' },
];

const PUBLIC_CALENDAR_OPTIONS: ReadonlyArray<{
  value: PublicCalendarAccess;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    value: 'PRIVATE',
    labelKey: 'WORKSPACE_SETTINGS.PUBLIC_ACCESS_PRIVATE_LABEL',
    descriptionKey: 'WORKSPACE_SETTINGS.PUBLIC_ACCESS_PRIVATE_DESC',
  },
  {
    value: 'BUSY_ONLY',
    labelKey: 'WORKSPACE_SETTINGS.PUBLIC_ACCESS_BUSY_ONLY_LABEL',
    descriptionKey: 'WORKSPACE_SETTINGS.PUBLIC_ACCESS_BUSY_ONLY_DESC',
  },
];

const DEFAULT_OPERATING_RULES: WorkspaceOperatingRules = {
  workingDays: [1, 2, 3, 4, 5],
  blockedDays: [],
  blockedHours: [],
};

@Component({
  selector: 'app-workspace-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
      TranslatePipe,
  ],
  templateUrl: './workspace-settings.component.html',
  styleUrl: './workspace-settings.component.scss',
})
export class WorkspaceSettingsComponent {
  private fb = inject(FormBuilder);
  ws = inject(WorkspaceService);
  private resourcesRepo = inject(ResourceRepository);
  private reservationsRepo = inject(ReservationRepository);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);
  readonly languageService = inject(LanguageService);

  timezones = TIMEZONES;
  readonly currencies = CURRENCIES;
  days = DAYS;
  publicCalendarOptions = PUBLIC_CALENDAR_OPTIONS;
  themes = [
    { value: ThemeMode.LIGHT, labelKey: 'WORKSPACE_SETTINGS.THEME_LIGHT' },
    { value: ThemeMode.MIDNIGHT, labelKey: 'WORKSPACE_SETTINGS.THEME_MIDNIGHT' },
    { value: ThemeMode.FOREST, labelKey: 'WORKSPACE_SETTINGS.THEME_FOREST' },
  ] as const;
  isLoading = signal(false);
  isUploadingLogo = signal(false);
  isRepublishingCatalog = signal(false);
  isQrGenerating = signal(false);
  publicBookingQrCode = signal('');
  paymentMethods = signal<string[]>(['Cash']);
  newPaymentMethod = signal('');
  readonly CalendarViewMode = CalendarViewMode;
  readonly ThemeMode = ThemeMode;
  readonly WorkspacePlan = WorkspacePlan;
  readonly planOptions = [
    { value: WorkspacePlan.FREE, labelKey: 'WORKSPACE_SETTINGS.PLAN_FREE' },
    { value: WorkspacePlan.PRO, labelKey: 'WORKSPACE_SETTINGS.PLAN_PRO' },
    { value: WorkspacePlan.ENTERPRISE, labelKey: 'WORKSPACE_SETTINGS.PLAN_BUSINESS' },
  ] as const;
  readonly HOURS = Array.from({ length: 24 }, (_, i) => i);

  /** Owners can keep or lower their plan; upgrades are activated by a platform admin. */
  isPlanLocked(plan: WorkspacePlan): boolean {
    const current = this.ws.workspace$()?.plan ?? WorkspacePlan.FREE;
    return PLAN_RANK[plan] > PLAN_RANK[current];
  }
  readonly languageOptions = this.languageService.languages;
  readonly businessTypes = workspaceBusinessTypes;

  form = this.fb.nonNullable.group({
    name:              ['', [Validators.required, Validators.maxLength(64)]],
    businessType:      ['Other', Validators.required],
    timezone:          ['Asia/Jerusalem', Validators.required],
    plan:              [WorkspacePlan.FREE, Validators.required],
    currency:          ['ILS', Validators.required],
    supportedCurrencies: this.fb.nonNullable.control<string[]>(['ILS']),
    phone:             [''],
    whishNumber:       [''],
    address:           [''],
    latitude:          [''],
    longitude:         [''],
    websiteUrl:        [''],
    instagramUrl:      [''],
    facebookUrl:       [''],
    tiktokUrl:         [''],
    calendarView:      [CalendarViewMode.MONTH, Validators.required],
    weekViewStartHour: [8,  [Validators.required, Validators.min(0), Validators.max(23)]],
    weekViewEndHour:   [22, [Validators.required, Validators.min(1), Validators.max(24)]],
    theme:             [ThemeMode.LIGHT, Validators.required],
    publicCalendarAccess: ['PRIVATE' as PublicCalendarAccess, Validators.required],
    workingDays:       this.fb.nonNullable.control<DayOfWeek[]>([...DEFAULT_OPERATING_RULES.workingDays]),
    blockedDays:       this.fb.nonNullable.control<DayOfWeek[]>([]),
    blockedHours:      this.fb.nonNullable.control<number[]>([]),
  });

  constructor() {
    effect(() => {
      const w = this.ws.workspace$();
      if (w) {
        this.paymentMethods.set(w.paymentMethods?.length ? [...w.paymentMethods] : ['Cash']);
        const settings = w.workspaceSettings;
        const rules = settings?.operatingRules ?? DEFAULT_OPERATING_RULES;

        this.form.patchValue({
          name:              w.name,
          businessType:      w.businessType ?? 'Other',
          timezone:          w.timezone,
          plan:              w.plan ?? WorkspacePlan.FREE,
          currency:          w.currency,
          supportedCurrencies: this.normalizeSupportedCurrencies(
            w.supportedCurrencies ?? [w.currency],
            w.currency,
          ),
          phone:             w.phone ?? '',
          whishNumber:       w.whishNumber ?? '',
          address:           w.address ?? '',
          latitude:          w.latitude == null ? '' : String(w.latitude),
          longitude:         w.longitude == null ? '' : String(w.longitude),
          websiteUrl:        w.websiteUrl ?? '',
          instagramUrl:      w.instagramUrl ?? '',
          facebookUrl:       w.facebookUrl ?? '',
          tiktokUrl:         w.tiktokUrl ?? '',
          calendarView:      w.calendarView      ?? CalendarViewMode.MONTH,
          weekViewStartHour: w.weekViewStartHour ?? 8,
          weekViewEndHour:   w.weekViewEndHour   ?? 22,
          theme:             settings?.theme ?? ThemeMode.LIGHT,
          publicCalendarAccess: this.normalizePublicAccess(settings?.publicCalendarAccess),
          workingDays:       [...rules.workingDays],
          blockedDays:       [...rules.blockedDays],
          blockedHours:      [...rules.blockedHours],
        });
      }
    });

    effect(() => {
      const link = this.publicBookingLink();
      void this.generatePublicBookingQrCode(link);
    });
  }

  isDaySelected(controlName: 'workingDays' | 'blockedDays', day: DayOfWeek): boolean {
    return this.form.controls[controlName].value.includes(day);
  }

  toggleDay(controlName: 'workingDays' | 'blockedDays', day: DayOfWeek): void {
    const current = this.form.controls[controlName].value;
    const updated = current.includes(day)
      ? current.filter((item) => item !== day)
      : [...current, day];

    this.form.controls[controlName].setValue(this.sortDays(updated as DayOfWeek[]));
  }

  isHourBlocked(hour: number): boolean {
    return this.form.controls.blockedHours.value.includes(hour);
  }

  toggleBlockedHour(hour: number): void {
    const current = this.form.controls.blockedHours.value;
    const updated = current.includes(hour)
      ? current.filter((item) => item !== hour)
      : [...current, hour];

    this.form.controls.blockedHours.setValue([...updated].sort((a, b) => a - b));
  }

  addPaymentMethod(): void {
    const name = this.newPaymentMethod().trim();
    if (!name) return;

    const current = this.paymentMethods();
    if (current.some((method) => method.toLowerCase() === name.toLowerCase())) {
      this.newPaymentMethod.set('');
      return;
    }

    this.paymentMethods.set([...current, name]);
    this.newPaymentMethod.set('');
  }

  removePaymentMethod(method: string): void {
    const remaining = this.paymentMethods().filter((item) => item !== method);
    this.paymentMethods.set(remaining.length ? remaining : ['Cash']);
  }

  onNewPaymentMethodInput(event: Event): void {
    this.newPaymentMethod.set((event.target as HTMLInputElement).value);
  }

  readonly currentWorkspaceLogoUrl = computed(() => this.ws.workspaceBrandLogoUrl());

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const wid = this.ws.activeWorkspaceId();
    if (!wid) {
      this.snack.open(this.t('WORKSPACE_SETTINGS.NO_ACTIVE_WORKSPACE'), this.t('COMMON.CLOSE'), { duration: 3500 });
      input.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVE_FAILED'), this.t('COMMON.CLOSE'), { duration: 4500 });
      input.value = '';
      return;
    }

    this.isUploadingLogo.set(true);
    try {
      const logoUrl = await this.ws.uploadLogo(wid, file);
      await this.ws.update({ workspaceId: wid, logoUrl });
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVED'), this.t('COMMON.YES'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVE_FAILED'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isUploadingLogo.set(false);
      input.value = '';
    }
  }

  async removeWorkspaceLogo(): Promise<void> {
    const wid = this.ws.activeWorkspaceId();
    if (!wid) return;

    this.isUploadingLogo.set(true);
    try {
      await this.ws.update({ workspaceId: wid, logoUrl: null });
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVED'), this.t('COMMON.YES'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVE_FAILED'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isUploadingLogo.set(false);
    }
  }

  publicBookingPath(): string {
    const wid = this.ws.activeWorkspaceId();
    return wid ? `/book/${wid}` : '';
  }

  publicBookingLink(): string {
    const path = this.publicBookingPath();
    if (!path) return '';
    return `${window.location.origin}${path}`;
  }

  async copyPublicBookingLink(): Promise<void> {
    const link = this.publicBookingLink();
    if (!link) {
      this.snack.open(this.t('WORKSPACE_SETTINGS.NO_ACTIVE_WORKSPACE'), this.t('COMMON.CLOSE'), { duration: 3500 });
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }

      this.snack.open(this.t('WORKSPACE_SETTINGS.PUBLIC_LINK_COPIED'), this.t('COMMON.YES'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('WORKSPACE_SETTINGS.PUBLIC_LINK_COPY_FAILED'), this.t('COMMON.CLOSE'), {
        duration: 4500,
      });
    }
  }

  async downloadPublicBookingQrCode(): Promise<void> {
    const qrCode = this.publicBookingQrCode();
    if (!qrCode) {
      return;
    }

    const workspaceId = this.ws.activeWorkspaceId() ?? 'workspace';
    try {
      const response = await fetch(qrCode);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `booking-link-${workspaceId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignore download errors silently to avoid noisy UX for optional action.
    }
  }

  async republishPublicCatalog(): Promise<void> {
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) {
      this.snack.open(this.t('WORKSPACE_SETTINGS.NO_ACTIVE_WORKSPACE'), this.t('COMMON.CLOSE'), { duration: 3500 });
      return;
    }

    this.isRepublishingCatalog.set(true);
    try {
      await this.ws.republishPublicWorkspaceDirectory(wid);
      const resourceCount = await this.resourcesRepo.republishPublicCatalog(wid);
      const busyCount = await this.reservationsRepo.republishPublicBusySlots(wid);
      this.snack.open(
        this.t('WORKSPACE_SETTINGS.PUBLIC_DATA_REFRESHED', { resourceCount, busyCount }),
        this.t('COMMON.YES'),
        { duration: 5000 },
      );
    } catch {
      this.snack.open(this.t('WORKSPACE_SETTINGS.PUBLIC_CATALOG_REFRESH_FAILED'), this.t('COMMON.CLOSE'), {
        duration: 4500,
      });
    } finally {
      this.isRepublishingCatalog.set(false);
    }
  }

  async onSave(): Promise<void> {
    if (!this.form.valid) return;
    const wid = this.ws.activeWorkspaceId();
    const uid = this.auth.getCurrentUser()?.uid;
    if (!wid || !uid) return;
    this.isLoading.set(true);
    try {
      const {
        name,
        businessType,
        timezone,
        plan,
        currency,
        supportedCurrencies,
        phone,
        whishNumber,
        address,
        latitude,
        longitude,
        websiteUrl,
        instagramUrl,
        facebookUrl,
        tiktokUrl,
        calendarView,
        weekViewStartHour,
        weekViewEndHour,
        theme,
        publicCalendarAccess,
        workingDays,
        blockedDays,
        blockedHours,
      } = this.form.getRawValue();

      if (weekViewStartHour >= weekViewEndHour) {
        this.snack.open(this.t('WORKSPACE_SETTINGS.WEEK_HOUR_RANGE_ERROR'), this.t('COMMON.CLOSE'), {
          duration: 4500,
        });
        return;
      }

      if (!workingDays.length) {
        this.snack.open(this.t('WORKSPACE_SETTINGS.WORKING_DAYS_REQUIRED'), this.t('COMMON.CLOSE'), { duration: 4500 });
        return;
      }

      await this.ws.update({
        workspaceId: wid,
        name,
        businessType,
        timezone,
        plan,
        currency,
        supportedCurrencies: this.normalizeSupportedCurrencies(supportedCurrencies, currency),
        phone,
        whishNumber,
        address,
        latitude: this.parseCoordinate(latitude),
        longitude: this.parseCoordinate(longitude),
        websiteUrl,
        instagramUrl,
        facebookUrl,
        tiktokUrl,
        paymentMethods: this.paymentMethods(),
        calendarView,
        weekViewStartHour,
        weekViewEndHour,
        workspaceSettings: {
          theme,
          publicCalendarAccess,
          operatingRules: {
            workingDays: this.sortDays([...workingDays]),
            blockedDays: this.sortDays([...blockedDays]),
            blockedHours: [...blockedHours].sort((a, b) => a - b),
          },
        },
      });
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVED'), this.t('COMMON.YES'), { duration: 3000 });
    } catch {
      this.snack.open(this.t('WORKSPACE_SETTINGS.SAVE_FAILED'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  private sortDays(days: DayOfWeek[]): DayOfWeek[] {
    return [...days].sort((a, b) => a - b) as DayOfWeek[];
  }

  private normalizePublicAccess(value: unknown): PublicCalendarAccess {
    const raw = String(value ?? '').trim().toUpperCase();
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

  onLanguageChange(lang: AppLanguage): void {
    this.languageService.setLanguage(lang);
  }

  onPrimaryCurrencyChange(currency: string): void {
    const supported = this.normalizeSupportedCurrencies(this.form.controls.supportedCurrencies.value, currency);
    this.form.controls.supportedCurrencies.setValue(supported);
  }

  onSupportedCurrenciesChange(selected: string[]): void {
    const supported = this.normalizeSupportedCurrencies(selected, this.form.controls.currency.value);
    this.form.controls.supportedCurrencies.setValue(supported, { emitEvent: false });

    if (!supported.includes(this.form.controls.currency.value)) {
      this.form.controls.currency.setValue(supported[0]);
    }
  }

  openExternalLink(rawUrl: string | null | undefined): void {
    const url = String(rawUrl ?? '').trim();
    if (!url) {
      return;
    }

    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }

  private parseCoordinate(value: string | null | undefined): number | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }

  private normalizeSupportedCurrencies(input: unknown, primaryCurrency: string): string[] {
    const normalized = normalizeCurrencyCodes(input);
    if (!normalized.length) {
      return [primaryCurrency];
    }

    if (!normalized.includes(primaryCurrency)) {
      return [primaryCurrency, ...normalized];
    }

    return normalized;
  }

  private async generatePublicBookingQrCode(link: string): Promise<void> {
    if (!link) {
      this.publicBookingQrCode.set('');
      return;
    }

    this.isQrGenerating.set(true);
    try {
      const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&data=${encodeURIComponent(link)}`;
      this.publicBookingQrCode.set(imageUrl);
    } catch {
      this.publicBookingQrCode.set('');
    } finally {
      this.isQrGenerating.set(false);
    }
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
