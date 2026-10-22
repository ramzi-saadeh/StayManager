import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AppLanguage, LanguageService } from '../../core/services/language.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { CalendarViewMode, WorkspacePlan } from '../../core/models/enums';
import { CURRENCIES } from '../../core/models/currencies';
import { workspaceBusinessTypes } from '../../core/mock/public-workspaces.mock';

const TIMEZONES = [
  'Asia/Jerusalem', 'Asia/Beirut', 'Asia/Amman', 'Asia/Dubai', 'Asia/Riyadh',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles',
  'Asia/Tokyo', 'Australia/Sydney',
];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    MatStepperModule,
    TranslatePipe,
  ],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  private fb        = inject(FormBuilder);
  private wsService = inject(WorkspaceService);
  private router    = inject(Router);
  private snack     = inject(MatSnackBar);
  private translate = inject(TranslateService);
  readonly languageService = inject(LanguageService);

  isLoading  = signal(false);
  timezones  = TIMEZONES;
  readonly currencies = CURRENCIES;
  readonly CalendarViewMode = CalendarViewMode;
  readonly WorkspacePlan = WorkspacePlan;
  readonly workspaceTypes = workspaceBusinessTypes;
  readonly accessOptions = [
    {
      mode: 'PUBLIC',
      titleKey: 'ONBOARDING.ACCESS_PUBLIC_TITLE',
      subtitleKey: 'ONBOARDING.ACCESS_PUBLIC_SUBTITLE',
    },
    {
      mode: 'PRIVATE',
      titleKey: 'ONBOARDING.ACCESS_PRIVATE_TITLE',
      subtitleKey: 'ONBOARDING.ACCESS_PRIVATE_SUBTITLE',
    },
  ] as const;
  readonly createdWorkspaceName = signal('');
  readonly planOptions = [
    { value: WorkspacePlan.FREE, labelKey: 'ONBOARDING.PLAN_FREE' },
    { value: WorkspacePlan.PRO, labelKey: 'ONBOARDING.PLAN_PRO' },
    { value: WorkspacePlan.ENTERPRISE, labelKey: 'ONBOARDING.PLAN_BUSINESS' },
  ] as const;

  readonly languageOptions = this.languageService.languages;

  nameForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(64)]],
  });

  typeForm = this.fb.nonNullable.group({
    workspaceType: ['Guest House', Validators.required],
  });

  accessForm = this.fb.nonNullable.group({
    accessMode: ['PUBLIC', Validators.required],
  });

  // Hours 0–23 for selects
  readonly HOURS = Array.from({ length: 24 }, (_, i) => i);

  settingsForm = this.fb.nonNullable.group({
    timezone:         ['Asia/Beirut', Validators.required],
    currency:         ['LBP', Validators.required],
    plan:             [WorkspacePlan.FREE, Validators.required],
    calendarView:     [CalendarViewMode.MONTH, Validators.required],
    weekViewStartHour: [8,  [Validators.required, Validators.min(0), Validators.max(23)]],
    weekViewEndHour:   [22, [Validators.required, Validators.min(1), Validators.max(24)]],
  });

  /** Auto-fill slug from workspace name. */
  onNameInput(): void { /* no-op */ }

  async onCreate(): Promise<void> {
    if (!this.nameForm.valid || !this.settingsForm.valid) return;
    if (this.isLoading()) return;  // prevent double-submit
    this.isLoading.set(true);
    try {
      const { name } = this.nameForm.getRawValue();
      this.createdWorkspaceName.set(name);
      const { timezone, currency, plan, calendarView, weekViewStartHour, weekViewEndHour } = this.settingsForm.getRawValue();
      const { workspaceType } = this.typeForm.getRawValue();
      const { accessMode } = this.accessForm.getRawValue();
      const result = await this.wsService.create({
        name,
        businessType: workspaceType,
        timezone,
        currency,
        plan,
        supportedCurrencies: [currency],
        calendarView,
        weekViewStartHour,
        weekViewEndHour,
      });
      if (result.success && (result as any).data?.workspaceId) {
        const publicCalendarAccess = accessMode === 'PUBLIC' ? 'BUSY_ONLY' : 'PRIVATE';
        await this.wsService.update({
          workspaceId: (result as any).data.workspaceId,
          workspaceSettings: {
            ...this.wsService.workspaceSettings(),
            publicCalendarAccess,
          },
        });

        this.wsService.selectWorkspace((result as any).data.workspaceId);
        if (plan === WorkspacePlan.FREE) {
          this.snack.open(this.t('ONBOARDING.WORKSPACE_READY'), this.t('ONBOARDING.OPEN_DASHBOARD'), {
            duration: 4200,
          }).onAction().subscribe(() => this.router.navigate(['/dashboard']));

          await this.router.navigate(['/dashboard']);
        } else {
          this.snack.open(this.t('ONBOARDING.PAID_PLAN_PENDING_APPROVAL'), this.t('COMMON.CLOSE'), {
            duration: 5000,
          });
          await this.router.navigate(['/activation-pending']);
        }
      } else {
          const msg = !result.success ? result.message : this.t('ONBOARDING.CREATE_FAILED');
          this.snack.open(msg, this.t('COMMON.CLOSE'), { duration: 5000 });
      }
    } catch {
        this.snack.open(this.t('ONBOARDING.UNEXPECTED_ERROR'), this.t('COMMON.CLOSE'), { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  onLanguageChange(lang: AppLanguage): void {
    this.languageService.setLanguage(lang);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
