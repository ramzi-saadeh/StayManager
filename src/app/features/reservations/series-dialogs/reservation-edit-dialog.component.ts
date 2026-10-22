import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { Reservation } from '../../../core/models/reservation.model';
import { SeriesScope } from '../../../core/models/recurrence.model';
import { UpdateReservationDetailsDto } from '../../../core/dtos/reservation.dto';
import { SeriesScopePickerComponent } from './series-scope-picker.component';

export interface ReservationEditDialogData {
  reservation: Reservation;
  /** Active, not-yet-ended bookings of the series, including this one. */
  upcomingInSeries: number;
}

export interface ReservationEditDialogResult {
  changes: UpdateReservationDetailsDto;
  scope: SeriesScope;
}

@Component({
  selector: 'app-reservation-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslatePipe,
    SeriesScopePickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'RESERVATION_SERIES.EDIT_TITLE' | translate }}</h2>

    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'RESERVATION_FORM.GUEST_NAME' | translate }}</mat-label>
          <input matInput formControlName="name" />
          @if (form.controls.name.invalid) {
            <mat-error>{{ 'RESERVATION_FORM.ERROR_GUEST_NAME_MIN' | translate }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'RESERVATION_FORM.PHONE' | translate }}</mat-label>
          <input matInput formControlName="phone" type="tel" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'RESERVATION_FORM.EMAIL_OPTIONAL' | translate }}</mat-label>
          <input matInput formControlName="email" type="email" />
          @if (form.controls.email.hasError('email')) {
            <mat-error>{{ 'RESERVATION_FORM.ERROR_VALID_EMAIL' | translate }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'RESERVATION_FORM.TOTAL_AMOUNT' | translate }}</mat-label>
          <input matInput formControlName="priceAmount" type="number" min="0" />
          <span matTextPrefix>{{ data.reservation.price.currency }}&nbsp;</span>
          @if (form.controls.priceAmount.invalid) {
            <mat-error>{{ 'RESERVATION_FORM.ERROR_AMOUNT_MIN' | translate }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'RESERVATION_FORM.INTERNAL_NOTES' | translate }}</mat-label>
          <textarea matInput formControlName="notes" rows="2"></textarea>
        </mat-form-field>

        @if (showScope) {
          <app-series-scope-picker [(scope)]="scope" [upcomingCount]="data.upcomingInSeries" />
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'COMMON.CANCEL' | translate }}</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">
          {{ 'COMMON.SAVE' | translate }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `.fields { display: flex; flex-direction: column; gap: 4px; min-width: min(420px, 80vw); }`,
})
export class ReservationEditDialogComponent {
  protected data = inject<ReservationEditDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<ReservationEditDialogComponent, ReservationEditDialogResult>>(MatDialogRef);
  private fb = inject(FormBuilder);

  scope = signal<SeriesScope>('THIS');
  readonly showScope = Boolean(this.data.reservation.seriesId) && this.data.upcomingInSeries > 1;

  readonly form = this.fb.nonNullable.group({
    name: [this.data.reservation.customer.name, [Validators.required, Validators.minLength(2)]],
    phone: [this.data.reservation.customer.phone, Validators.required],
    email: [this.data.reservation.customer.email ?? '', Validators.email],
    notes: [this.data.reservation.notes ?? ''],
    priceAmount: [this.data.reservation.price.amount, [Validators.required, Validators.min(0)]],
  });

  save(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.dialogRef.close({
      scope: this.showScope ? this.scope() : 'THIS',
      changes: {
        customer: {
          name: value.name.trim(),
          phone: value.phone.trim(),
          email: value.email.trim() || null,
        },
        notes: value.notes.trim() || null,
        priceAmount: Number(value.priceAmount),
      },
    });
  }
}
