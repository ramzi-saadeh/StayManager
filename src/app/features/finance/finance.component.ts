import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { StatCardComponent } from '../../ui/stat-card/stat-card.component';
import { SummaryRepository } from '../../core/services/summary.repository';
import { WorkspaceService } from '../../core/services/workspace.service';
import { LanguageService } from '../../core/services/language.service';
import { ExpenseRepository } from '../../core/services/expense.repository';
import { Reservation } from '../../core/models/reservation.model';
import { PaymentStatus, ReservationStatus } from '../../core/models/enums';
import { MonthlySummary } from '../../core/models/summary.model';
import { Expense } from '../../core/models/expense.model';
import { AuthService } from '../../services/auth.service';

interface ExpenseItem {
  id: string;
  label: string;
  date: string;
  amount: number;
}

interface MonthOption {
  value: string | null;
  label: string;
}

interface MonthlyPerformance {
  month: string;
  income: number;
  expenses: number;
  net: number;
  expenseLabels: string[];
}

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    TranslatePipe,
    EmptyStateComponent,
    StatCardComponent,
  ],
  templateUrl: './finance.component.html',
  styleUrl: './finance.component.scss',
})
export class FinanceComponent {
  private reservationRepo = inject(ReservationRepository);
  private summaryRepo = inject(SummaryRepository);
  private expenseRepo = inject(ExpenseRepository);
  private ws = inject(WorkspaceService);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);
  readonly languageService = inject(LanguageService);

  month = signal<string | null>(this.currentMonthIso());
  expenseDraftLabel = signal('');
  expenseDraftAmount = signal<number | null>(null);
  expenseDraftDate = signal<Date | null>(new Date());

  private workspaceId$ = toObservable(this.ws.activeWorkspaceId);
  private month$ = toObservable(this.month);

  allReservations = toSignal(
    this.workspaceId$.pipe(
      switchMap((workspaceId) => (workspaceId ? this.reservationRepo.list(workspaceId) : of([]))),
    ),
    { initialValue: [] as Reservation[] },
  );

  selectedSummary = toSignal(
    combineLatest([this.workspaceId$, this.month$]).pipe(
      switchMap(([workspaceId, month]) => {
        if (!workspaceId || !month) {
          return of(undefined);
        }
        return this.summaryRepo.getMonth(workspaceId, month);
      }),
    ),
    { initialValue: undefined as MonthlySummary | undefined },
  );

  recentSummaries = toSignal(
    this.workspaceId$.pipe(
      switchMap((workspaceId) => (workspaceId ? this.summaryRepo.listRecent(workspaceId, 6) : of([]))),
    ),
    { initialValue: [] as MonthlySummary[] },
  );

  expenseDocs = toSignal(
    combineLatest([this.workspaceId$, this.month$]).pipe(
      switchMap(([workspaceId, month]) => (
        workspaceId ? this.expenseRepo.list(workspaceId, month ?? undefined) : of([])
      )),
    ),
    { initialValue: [] as Expense[] },
  );

  allExpenseDocs = toSignal(
    this.workspaceId$.pipe(
      switchMap((workspaceId) => (workspaceId ? this.expenseRepo.list(workspaceId) : of([]))),
    ),
    { initialValue: [] as Expense[] },
  );

  expenses = computed<ExpenseItem[]>(() =>
    this.expenseDocs()
      .sort((a, b) => {
        const byDate = this.expenseDateOf(b).localeCompare(this.expenseDateOf(a));
        if (byDate !== 0) {
          return byDate;
        }
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      })
      .map((expense) => ({
        id: expense.expenseId,
        label: expense.label,
        date: this.expenseDateOf(expense),
        amount: expense.amount,
      })),
  );

  monthOptions = computed(() => {
    const map = new Map<string, MonthOption>();

    for (const option of this.buildMonthOptions(24)) {
      map.set(option.value ?? '', option);
    }

    for (const row of this.monthlyPerformance()) {
      if (!map.has(row.month)) {
        map.set(row.month, { value: row.month, label: this.monthLabel(row.month) });
      }
    }

    const options = Array.from(map.values()).sort((a, b) =>
      (b.value ?? '').localeCompare(a.value ?? ''),
    );

    return [{ value: null, label: this.t('FINANCE.ALL_TIME') }, ...options];
  });

  monthReservations = computed(() => {
    const month = this.month();
    const activeReservations = this.activeReservations();

    if (!month) {
      return activeReservations;
    }

    return activeReservations.filter((reservation) => this.reservationMonthKey(reservation) === month);
  });

  activeReservations = computed(() =>
    this.allReservations().filter(
      (reservation) =>
        reservation.status !== ReservationStatus.CANCELLED &&
        reservation.status !== ReservationStatus.DELETED,
    ),
  );

  collectedReservations = computed(() =>
    this.monthReservations().filter(
      (reservation) =>
        (reservation.paymentStatus ?? PaymentStatus.UNPAID) === PaymentStatus.PAID,
    ),
  );

  cashCollected = computed(() => {
    return this.monthReservations()
      .filter((reservation) =>
        (reservation.paymentStatus ?? PaymentStatus.UNPAID) === PaymentStatus.PAID,
      )
      .reduce((sum, reservation) => sum + (reservation.price?.amount ?? 0), 0);
  });

  unpaidBookings = computed(() => {
    return this.monthReservations()
      .filter((reservation) => (reservation.paymentStatus ?? PaymentStatus.UNPAID) !== PaymentStatus.PAID)
      .reduce((sum, reservation) => sum + (reservation.price?.amount ?? 0), 0);
  });

  paymentMethodBreakdown = computed(() => {
    const totals = new Map<string, number>();

    for (const reservation of this.collectedReservations()) {
      const method = this.reservationPaymentMethod(reservation);
      totals.set(method, (totals.get(method) ?? 0) + (reservation.price?.amount ?? 0));
    }

    return Array.from(totals.entries())
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  forecastIncome = computed(() => this.cashCollected() + this.unpaidBookings());
  expenseTotal = computed(() => this.expenses().reduce((sum, expense) => sum + expense.amount, 0));
  netCashAfterExpenses = computed(() => this.forecastIncome() - this.expenseTotal());
  monthlyPerformance = computed<MonthlyPerformance[]>(() => {
    const incomeByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    const expenseLabelTotalsByMonth = new Map<string, Map<string, number>>();

    for (const reservation of this.activeReservations()) {
      const monthKey = this.reservationMonthKey(reservation);
      if (!monthKey) {
        continue;
      }
      const income = reservation.price?.amount ?? 0;
      incomeByMonth.set(monthKey, (incomeByMonth.get(monthKey) ?? 0) + income);
    }

    for (const expense of this.allExpenseDocs()) {
      const monthKey = this.expenseMonthKey(expense);
      if (!monthKey) {
        continue;
      }
      expenseByMonth.set(monthKey, (expenseByMonth.get(monthKey) ?? 0) + (expense.amount ?? 0));

      const normalizedLabel = expense.label?.trim() || this.t('FINANCE.OTHER_EXPENSE');
      if (!expenseLabelTotalsByMonth.has(monthKey)) {
        expenseLabelTotalsByMonth.set(monthKey, new Map<string, number>());
      }
      const monthLabels = expenseLabelTotalsByMonth.get(monthKey)!;
      monthLabels.set(normalizedLabel, (monthLabels.get(normalizedLabel) ?? 0) + (expense.amount ?? 0));
    }

    const keys = new Set<string>([
      ...incomeByMonth.keys(),
      ...expenseByMonth.keys(),
    ]);

    return Array.from(keys)
      .map((month) => {
        const income = incomeByMonth.get(month) ?? 0;
        const expenses = expenseByMonth.get(month) ?? 0;
        const expenseLabels = Array.from(expenseLabelTotalsByMonth.get(month)?.entries() ?? [])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label]) => label);
        return {
          month,
          income,
          expenses,
          net: income - expenses,
          expenseLabels,
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  });

  topExpenseMonth = computed<MonthlyPerformance | null>(() => {
    const rows = this.monthlyPerformance().filter((row) => row.expenses > 0);
    if (!rows.length) {
      return null;
    }

    return [...rows].sort((a, b) => b.expenses - a.expenses)[0] ?? null;
  });

  topIncomeMonth = computed<MonthlyPerformance | null>(() => {
    const rows = this.monthlyPerformance().filter((row) => row.income > 0);
    if (!rows.length) {
      return null;
    }

    return [...rows].sort((a, b) => b.income - a.income)[0] ?? null;
  });

  bookingCount = computed(() => {
    if (!this.month()) {
      return this.activeReservations().length;
    }

    const summary = this.selectedSummary();
    if (summary) {
      return summary.confirmedCount + summary.pendingCount;
    }

    return this.monthReservations().length;
  });

  readonly currencyLabel = computed(() => this.ws.currency());

  setMonth(month: string | null): void {
    this.month.set(month);
  }

  setExpenseDraftLabel(event: Event): void {
    this.expenseDraftLabel.set((event.target as HTMLInputElement).value);
  }

  setExpenseDraftAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.expenseDraftAmount.set(value === '' ? null : Number(value));
  }

  setExpenseDraftDate(value: Date | null): void {
    this.expenseDraftDate.set(value);
  }

  async addExpense(): Promise<void> {
    const label = this.expenseDraftLabel().trim();
    const amount = this.expenseDraftAmount();
    const expenseDate = this.toIsoDate(this.expenseDraftDate());
    const workspaceId = this.ws.activeWorkspaceId();
    const userId = this.auth.getCurrentUser()?.uid;

    if (
      !workspaceId
      || !userId
      || !label
      || amount === null
      || amount <= 0
      || !expenseDate
    ) {
      return;
    }

    await this.expenseRepo.create(
      workspaceId,
      {
        expenseDate,
        month: expenseDate.slice(0, 7),
        label,
        amount,
      },
      userId,
    );

    this.expenseDraftLabel.set('');
    this.expenseDraftAmount.set(null);
  }

  exportMonthlySummaryCsv(): void {
    const rows = this.monthlyPerformance();
    if (!rows.length) {
      return;
    }

    const header = [
      this.t('FINANCE.TABLE_MONTH'),
      this.t('FINANCE.TABLE_INCOME'),
      this.t('FINANCE.TABLE_EXPENSES'),
      this.t('FINANCE.TABLE_EXPENSE_LABELS'),
      this.t('FINANCE.TABLE_NET'),
    ];

    const csvRows = rows.map((row) => [
      this.monthLabel(row.month),
      String(row.income),
      String(row.expenses),
      row.expenseLabels.join(' | '),
      String(row.net),
    ]);

    const csvContent = [header, ...csvRows]
      .map((line) => line.map((value) => this.escapeCsv(value)).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance-summary-${this.todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  expenseLabelsSummary(row: MonthlyPerformance): string {
    if (!row.expenseLabels.length) {
      return this.t('FINANCE.NO_DATA');
    }
    return row.expenseLabels.join(', ');
  }

  async removeExpense(id: string): Promise<void> {
    const workspaceId = this.ws.activeWorkspaceId();
    if (!workspaceId) {
      return;
    }
    await this.expenseRepo.remove(workspaceId, id);
  }

  monthLabel(month: string | null): string {
    if (!month) {
      return this.t('FINANCE.ALL_TIME');
    }

    const [year, monthIndex] = month.split('-').map((part) => Number(part));
    if (!year || !monthIndex) {
      return month;
    }
    return new Date(year, monthIndex - 1, 1).toLocaleDateString(this.localeCode(), {
      month: 'long',
      year: 'numeric',
    });
  }

  methodLabel(method: string): string {
    return this.isCashMethod(method) ? this.t('FINANCE.PAYMENT_METHOD_CASH') : method;
  }

  methodHint(method: string): string {
    return this.isCashMethod(method)
      ? this.t('FINANCE.PAYMENT_METHOD_CASH_HINT')
      : this.t('FINANCE.PAYMENT_METHOD_ACCEPTED_HINT');
  }

  amount(value: number): string {
    return `${this.currencyLabel()} ${value.toLocaleString()}`;
  }

  expenseDateLabel(value: string): string {
    if (!value) {
      return this.t('FINANCE.UNKNOWN_DATE');
    }

    const [year, month, day] = value.split('-').map((part) => Number(part));
    if (!year || !month || !day) {
      return value;
    }

    return new Date(year, month - 1, day).toLocaleDateString(this.localeCode(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  private currentMonthIso(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private toIsoDate(value: Date | null): string | null {
    if (!value || Number.isNaN(value.getTime())) {
      return null;
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private buildMonthOptions(count: number): MonthOption[] {
    const options: MonthOption[] = [];
    const now = new Date();

    for (let index = 0; index < count; index += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const value = date.toISOString().slice(0, 7);
      options.push({
        value,
        label: date.toLocaleDateString(this.localeCode(), { month: 'long', year: 'numeric' }),
      });
    }

    return options;
  }

  private reservationMonthKey(reservation: Reservation): string {
    if (reservation.startDate) {
      return reservation.startDate.slice(0, 7);
    }

    if (reservation.start) {
      return reservation.start.toDate().toISOString().slice(0, 7);
    }

    return '';
  }

  private expenseMonthKey(expense: Expense): string {
    if (expense.month && /^\d{4}-\d{2}$/.test(expense.month)) {
      return expense.month;
    }

    const expenseDate = this.expenseDateOf(expense);
    return expenseDate ? expenseDate.slice(0, 7) : '';
  }

  private expenseDateOf(expense: Expense): string {
    if (expense.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(expense.expenseDate)) {
      return expense.expenseDate;
    }

    if (expense.month && /^\d{4}-\d{2}$/.test(expense.month)) {
      return `${expense.month}-01`;
    }

    return expense.createdAt.toDate().toISOString().slice(0, 10);
  }

  private reservationPaymentMethod(reservation: Reservation): string {
    return reservation.paymentMethod?.trim() || this.t('FINANCE.PAYMENT_METHOD_CASH');
  }

  private localeCode(): string {
    return this.languageService.language() === 'ar' ? 'ar-LB' : 'en-US';
  }

  private isCashMethod(method: string): boolean {
    const normalized = method.trim().toLowerCase();
    return normalized === 'cash' || normalized === this.t('FINANCE.PAYMENT_METHOD_CASH').trim().toLowerCase();
  }

  private escapeCsv(value: string): string {
    const normalized = String(value ?? '');
    if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
      return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }

}