import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PaymentStatus, ReservationStatus } from '../../core/models/enums';
import { Expense } from '../../core/models/expense.model';
import { Reservation } from '../../core/models/reservation.model';
import { ExpenseRepository } from '../../core/services/expense.repository';
import { LanguageService } from '../../core/services/language.service';
import { ReservationRepository } from '../../core/services/reservation.repository';
import { WorkspaceService } from '../../core/services/workspace.service';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

interface MonthOption {
  value: string | null;
  label: string;
}

interface MonthlyFinanceRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
  expenseLabels: string[];
}

interface MonthlyChartRow {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
}

interface StatusReportRow {
  status: ReservationStatus;
  count: number;
  amount: number;
}

interface MethodReportRow {
  method: string;
  count: number;
  amount: number;
}

interface ResourceReportRow {
  resourceName: string;
  bookings: number;
  income: number;
  unpaid: number;
}

interface ReceivableRow {
  reservationId: string;
  customerName: string;
  customerPhone: string;
  resourceName: string;
  bookingDate: string;
  amount: number;
  paymentStatus: PaymentStatus;
}

interface ExpenseLabelRow {
  label: string;
  count: number;
  total: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    TranslatePipe,
    EmptyStateComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  private readonly ws = inject(WorkspaceService);
  private readonly reservationRepo = inject(ReservationRepository);
  private readonly expenseRepo = inject(ExpenseRepository);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  readonly reportMonth = signal<string | null>(this.currentMonthIso());
  private readonly workspaceId$ = toObservable(this.ws.activeWorkspaceId);

  readonly reservations = toSignal(
    this.workspaceId$.pipe(
      switchMap((workspaceId) => (workspaceId ? this.reservationRepo.list(workspaceId) : of([]))),
    ),
    { initialValue: [] as Reservation[] },
  );

  readonly expenses = toSignal(
    this.workspaceId$.pipe(
      switchMap((workspaceId) => (workspaceId ? this.expenseRepo.list(workspaceId) : of([]))),
    ),
    { initialValue: [] as Expense[] },
  );

  readonly monthOptions = computed<MonthOption[]>(() => {
    const monthMap = new Map<string, MonthOption>();
    monthMap.set('', { value: null, label: this.t('REPORTS.ALL_TIME') });

    for (let index = 0; index < 18; index += 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - index);
      const value = this.isoMonth(date);
      monthMap.set(value, { value, label: this.monthLabel(value) });
    }

    for (const reservation of this.reservations()) {
      const month = this.reservationMonthKey(reservation);
      if (month) {
        monthMap.set(month, { value: month, label: this.monthLabel(month) });
      }
    }

    for (const expense of this.expenses()) {
      const month = this.expenseMonthKey(expense);
      if (month) {
        monthMap.set(month, { value: month, label: this.monthLabel(month) });
      }
    }

    return Array.from(monthMap.values()).sort((a, b) => (b.value ?? '').localeCompare(a.value ?? ''));
  });

  readonly reservationsInPeriod = computed(() => {
    const month = this.reportMonth();
    const rows = this.reservations().filter((r) => r.status !== ReservationStatus.DELETED);
    if (!month) {
      return rows;
    }
    return rows.filter((r) => this.reservationMonthKey(r) === month);
  });

  readonly operationalReservations = computed(() =>
    this.reservationsInPeriod().filter(
      (r) => r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.DELETED,
    ),
  );

  readonly expensesInPeriod = computed(() => {
    const month = this.reportMonth();
    if (!month) {
      return this.expenses();
    }
    return this.expenses().filter((e) => this.expenseMonthKey(e) === month);
  });

  readonly statusReport = computed<StatusReportRow[]>(() => {
    const statusList: ReservationStatus[] = [
      ReservationStatus.PENDING,
      ReservationStatus.CONFIRMED,
      ReservationStatus.COMPLETED,
      ReservationStatus.CANCELLED,
    ];

    return statusList.map((status) => {
      const rows = this.reservationsInPeriod().filter((r) => r.status === status);
      return {
        status,
        count: rows.length,
        amount: rows.reduce((sum, row) => sum + (row.price?.amount ?? 0), 0),
      };
    });
  });

  readonly paymentMethodReport = computed<MethodReportRow[]>(() => {
    const map = new Map<string, MethodReportRow>();

    for (const reservation of this.operationalReservations()) {
      if ((reservation.paymentStatus ?? PaymentStatus.UNPAID) !== PaymentStatus.PAID) {
        continue;
      }

      const method = reservation.paymentMethod?.trim() || this.t('FINANCE.PAYMENT_METHOD_CASH');
      const amount = reservation.price?.amount ?? 0;
      const current = map.get(method) ?? { method, count: 0, amount: 0 };
      current.count += 1;
      current.amount += amount;
      map.set(method, current);
    }

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  });

  readonly resourcePerformanceReport = computed<ResourceReportRow[]>(() => {
    const map = new Map<string, ResourceReportRow>();

    for (const reservation of this.operationalReservations()) {
      const key = reservation.resourceName?.trim() || this.t('REPORTS.UNKNOWN_RESOURCE');
      const amount = reservation.price?.amount ?? 0;
      const isPaid = (reservation.paymentStatus ?? PaymentStatus.UNPAID) === PaymentStatus.PAID;

      const current = map.get(key) ?? { resourceName: key, bookings: 0, income: 0, unpaid: 0 };
      current.bookings += 1;
      if (isPaid) {
        current.income += amount;
      } else {
        current.unpaid += amount;
      }
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => b.bookings - a.bookings);
  });

  readonly receivablesReport = computed<ReceivableRow[]>(() => {
    return this.operationalReservations()
      .filter((reservation) => (reservation.paymentStatus ?? PaymentStatus.UNPAID) !== PaymentStatus.PAID)
      .map((reservation) => ({
        reservationId: reservation.reservationId,
        customerName: reservation.customer?.name ?? this.t('REPORTS.UNKNOWN_CUSTOMER'),
        customerPhone: reservation.customer?.phone ?? '-',
        resourceName: reservation.resourceName ?? this.t('REPORTS.UNKNOWN_RESOURCE'),
        bookingDate: this.reservationDateLabel(reservation),
        amount: reservation.price?.amount ?? 0,
        paymentStatus: reservation.paymentStatus ?? PaymentStatus.UNPAID,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 40);
  });

  readonly expenseLabelsReport = computed<ExpenseLabelRow[]>(() => {
    const map = new Map<string, ExpenseLabelRow>();

    for (const expense of this.expensesInPeriod()) {
      const label = expense.label?.trim() || this.t('FINANCE.OTHER_EXPENSE');
      const current = map.get(label) ?? { label, count: 0, total: 0 };
      current.count += 1;
      current.total += expense.amount ?? 0;
      map.set(label, current);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  });

  readonly monthlyFinanceReport = computed<MonthlyFinanceRow[]>(() => {
    const incomeByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    const expenseLabelsByMonth = new Map<string, Map<string, number>>();

    for (const reservation of this.reservations()) {
      if (reservation.status === ReservationStatus.CANCELLED || reservation.status === ReservationStatus.DELETED) {
        continue;
      }
      const month = this.reservationMonthKey(reservation);
      if (!month) {
        continue;
      }
      const amount = reservation.price?.amount ?? 0;
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + amount);
    }

    for (const expense of this.expenses()) {
      const month = this.expenseMonthKey(expense);
      if (!month) {
        continue;
      }

      expenseByMonth.set(month, (expenseByMonth.get(month) ?? 0) + (expense.amount ?? 0));
      const label = expense.label?.trim() || this.t('FINANCE.OTHER_EXPENSE');
      if (!expenseLabelsByMonth.has(month)) {
        expenseLabelsByMonth.set(month, new Map<string, number>());
      }
      const monthLabelMap = expenseLabelsByMonth.get(month)!;
      monthLabelMap.set(label, (monthLabelMap.get(label) ?? 0) + (expense.amount ?? 0));
    }

    const keys = new Set<string>([...incomeByMonth.keys(), ...expenseByMonth.keys()]);

    return Array.from(keys)
      .map((month) => {
        const income = incomeByMonth.get(month) ?? 0;
        const expenses = expenseByMonth.get(month) ?? 0;
        const expenseLabels = Array.from(expenseLabelsByMonth.get(month)?.entries() ?? [])
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

  readonly totalIncome = computed(() =>
    this.operationalReservations().reduce((sum, reservation) => sum + (reservation.price?.amount ?? 0), 0),
  );
  readonly totalExpenses = computed(() =>
    this.expensesInPeriod().reduce((sum, expense) => sum + (expense.amount ?? 0), 0),
  );
  readonly totalNet = computed(() => this.totalIncome() - this.totalExpenses());

  readonly monthlyChartRows = computed<MonthlyChartRow[]>(() => {
    // Keep the chart focused on recent trend while still representing all months.
    return [...this.monthlyFinanceReport()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((row) => ({
        month: row.month,
        monthLabel: this.shortMonthLabel(row.month),
        income: row.income,
        expenses: row.expenses,
        net: row.net,
      }));
  });

  readonly monthlyChartMax = computed(() => {
    const values = this.monthlyChartRows().flatMap((row) => [row.income, row.expenses]);
    return Math.max(0, ...values);
  });

  readonly bestMonthByNet = computed<MonthlyChartRow | null>(() => {
    const rows = this.monthlyChartRows();
    if (!rows.length) {
      return null;
    }

    return [...rows].sort((a, b) => b.net - a.net)[0] ?? null;
  });

  readonly worstMonthByNet = computed<MonthlyChartRow | null>(() => {
    const rows = this.monthlyChartRows();
    if (!rows.length) {
      return null;
    }

    return [...rows].sort((a, b) => a.net - b.net)[0] ?? null;
  });

  readonly periodLabel = computed(() => {
    const month = this.reportMonth();
    return month ? this.monthLabel(month) : this.t('REPORTS.ALL_TIME');
  });

  setReportMonth(month: string | null): void {
    this.reportMonth.set(month);
  }

  printAllReports(): void {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.report-print-section'));
    if (!sections.length) {
      return;
    }

    const content = sections.map((section) => section.outerHTML).join('');
    this.printHtmlContent(content, this.t('REPORTS.TITLE'));
  }

  printSection(sectionId: string, title: string): void {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    this.printHtmlContent(section.outerHTML, title);
  }

  printSectionByKey(sectionId: string, titleKey: string): void {
    this.printSection(sectionId, this.t(titleKey));
  }

  amount(value: number): string {
    return `${this.ws.currency()} ${value.toLocaleString()}`;
  }

  monthLabel(month: string): string {
    const [year, monthValue] = month.split('-').map((part) => Number(part));
    if (!year || !monthValue) {
      return month;
    }
    return new Date(year, monthValue - 1, 1).toLocaleDateString(this.localeCode(), {
      month: 'long',
      year: 'numeric',
    });
  }

  statusLabel(status: ReservationStatus): string {
    if (status === ReservationStatus.PENDING) return this.t('REPORTS.STATUS_PENDING');
    if (status === ReservationStatus.CONFIRMED) return this.t('REPORTS.STATUS_CONFIRMED');
    if (status === ReservationStatus.COMPLETED) return this.t('REPORTS.STATUS_COMPLETED');
    if (status === ReservationStatus.CANCELLED) return this.t('REPORTS.STATUS_CANCELLED');
    return status;
  }

  paymentStatusLabel(status: PaymentStatus): string {
    if (status === PaymentStatus.UNPAID) return this.t('REPORTS.PAYMENT_UNPAID');
    if (status === PaymentStatus.PARTIAL) return this.t('REPORTS.PAYMENT_PARTIAL');
    if (status === PaymentStatus.PAID) return this.t('REPORTS.PAYMENT_PAID');
    return status;
  }

  expenseLabelsSummary(labels: string[]): string {
    if (!labels.length) {
      return this.t('REPORTS.NO_EXPENSE_LABELS');
    }
    return labels.join(', ');
  }

  chartBarHeight(value: number): number {
    const max = this.monthlyChartMax();
    if (!max || value <= 0) {
      return 0;
    }
    return Math.max(4, (value / max) * 100);
  }

  chartMonthTooltip(row: MonthlyChartRow): string {
    return `${this.monthLabel(row.month)}: ${this.t('REPORTS.INCOME')} ${this.amount(row.income)} | ${this.t('REPORTS.EXPENSES')} ${this.amount(row.expenses)} | ${this.t('REPORTS.NET')} ${this.amount(row.net)}`;
  }

  chartMonthNetClass(row: MonthlyChartRow): string {
    return row.net >= 0 ? 'net-positive' : 'net-negative';
  }

  private reservationDateLabel(reservation: Reservation): string {
    if (reservation.startDate) {
      return reservation.startDate;
    }

    if (reservation.start) {
      return reservation.start.toDate().toLocaleDateString(this.localeCode());
    }

    return '-';
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

    if (expense.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(expense.expenseDate)) {
      return expense.expenseDate.slice(0, 7);
    }

    return expense.createdAt.toDate().toISOString().slice(0, 7);
  }

  private isoMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private currentMonthIso(): string {
    return this.isoMonth(new Date());
  }

  private shortMonthLabel(month: string): string {
    const [year, monthValue] = month.split('-').map((part) => Number(part));
    if (!year || !monthValue) {
      return month;
    }

    return new Date(year, monthValue - 1, 1).toLocaleDateString(this.localeCode(), {
      month: 'short',
    });
  }

  private localeCode(): string {
    return this.languageService.language() === 'ar' ? 'ar-LB' : 'en-US';
  }

  private printHtmlContent(contentHtml: string, title: string): void {
    const generatedAt = new Date().toLocaleString(this.localeCode());
    const printableContent = this.sanitizeForPrint(contentHtml);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      iframe.remove();
      return;
    }

    doc.open();
    doc.write(`
      <html>
      <head>
        <title>${this.escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 4px; font-size: 22px; }
          .meta { margin: 0 0 20px; color: #64748b; font-size: 12px; }
          .report-print-section { margin: 0 0 22px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
          .report-title { margin: 0 0 10px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f8fafc; }
          .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
          .metric { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; }
          .metric-label { display: block; font-size: 11px; color: #64748b; }
          .metric-value { font-size: 14px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h1>${this.escapeHtml(this.t('REPORTS.TITLE'))}</h1>
        <p class="meta">${this.escapeHtml(this.t('REPORTS.PERIOD'))}: ${this.escapeHtml(this.periodLabel())} | ${this.escapeHtml(this.t('REPORTS.GENERATED_AT'))}: ${this.escapeHtml(generatedAt)}</p>
        ${printableContent}
      </body>
      </html>
    `);
    doc.close();

    // Give the iframe one paint cycle before opening the print dialog.
    requestAnimationFrame(() => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        iframe.remove();
        return;
      }

      frameWindow.focus();
      frameWindow.print();

      window.setTimeout(() => {
        iframe.remove();
      }, 500);
    });
  }

  private sanitizeForPrint(contentHtml: string): string {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = contentHtml;

    // Remove UI controls that are useful on screen but should never appear on paper.
    wrapper.querySelectorAll('.no-print, button, [mat-stroked-button], [mat-flat-button], [mat-button]').forEach((el) => el.remove());

    return wrapper.innerHTML;
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translate.instant(key, params);
  }
}
