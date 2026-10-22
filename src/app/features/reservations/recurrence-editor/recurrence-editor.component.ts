import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs/operators';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { RecurrenceFrequency } from '../../../core/models/enums';
import { RecurrenceEnd, RecurrenceRule, Weekday } from '../../../core/models/recurrence.model';
import { SeriesOccurrencePreview } from '../../../core/dtos/reservation.dto';
import {
  RECURRENCE_MAX_INTERVAL,
  RECURRENCE_MAX_OCCURRENCES,
  getRecurrenceRuleError,
  normalizeRecurrenceRule,
  toDateOnly,
} from '../../../core/utils/recurrence';

type FrequencyChoice = 'NONE' | RecurrenceFrequency;

@Component({
  selector: 'app-recurrence-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './recurrence-editor.component.html',
  styleUrl: './recurrence-editor.component.scss',
})
export class RecurrenceEditorComponent {
  private fb = inject(FormBuilder);

  readonly Frequency = RecurrenceFrequency;
  readonly maxCount = RECURRENCE_MAX_OCCURRENCES;
  readonly maxInterval = RECURRENCE_MAX_INTERVAL;
  readonly weekdays: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

  /** Start of the first booking; drives the implicit weekday and the earliest end date. */
  firstStart = input<Date | null>(null);
  isDateRange = input(true);
  preview = input<SeriesOccurrencePreview[] | null>(null);
  previewLoading = input(false);

  /** Null when the booking does not repeat or the settings are incomplete. */
  rule = model<RecurrenceRule | null>(null);
  /** False while a repeating booking has incomplete or invalid settings. */
  valid = model(true);
  skipConflicts = model(false);

  readonly form = this.fb.nonNullable.group({
    frequency: ['NONE' as FrequencyChoice],
    interval: [1, [Validators.required, Validators.min(1), Validators.max(RECURRENCE_MAX_INTERVAL)]],
    endType: ['COUNT' as RecurrenceEnd['type']],
    count: [4, [Validators.required, Validators.min(2), Validators.max(RECURRENCE_MAX_OCCURRENCES)]],
    until: [null as Date | null],
  });

  private extraWeekdays = signal<Weekday[]>([]);
  private formValue = toSignal(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  readonly repeats = computed(() => this.formValue().frequency !== 'NONE');
  readonly startWeekday = computed(() => this.firstStart()?.getDay() as Weekday | undefined);
  readonly minUntil = computed(() => this.firstStart() ?? new Date());

  readonly unavailableCount = computed(
    () => this.preview()?.filter((item) => item.status !== 'OK').length ?? 0,
  );

  private state = computed<{ rule: RecurrenceRule | null; valid: boolean }>(() => {
    const value = this.formValue();
    if (value.frequency === 'NONE') return { rule: null, valid: true };

    const end = this.buildEnd(value.endType, value.count, value.until);
    if (!end || !this.firstStart()) return { rule: null, valid: false };

    const rule = normalizeRecurrenceRule({
      frequency: value.frequency,
      interval: Number(value.interval),
      weekdays: this.extraWeekdays(),
      end,
    });
    return getRecurrenceRuleError(rule) ? { rule: null, valid: false } : { rule, valid: true };
  });

  constructor() {
    effect(() => {
      const { rule, valid } = this.state();
      this.rule.set(rule);
      this.valid.set(valid);
    });
  }

  isWeekdaySelected(day: Weekday): boolean {
    return day === this.startWeekday() || this.extraWeekdays().includes(day);
  }

  toggleWeekday(day: Weekday): void {
    if (day === this.startWeekday()) return;
    this.extraWeekdays.update((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  }

  private buildEnd(type: RecurrenceEnd['type'], count: number, until: Date | null): RecurrenceEnd | null {
    if (type === 'COUNT') return { type: 'COUNT', count: Number(count) };
    return until ? { type: 'UNTIL', date: toDateOnly(until) } : null;
  }
}
