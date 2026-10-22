import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { SeriesScope } from '../../../core/models/recurrence.model';
import { SeriesScopePickerComponent } from './series-scope-picker.component';

export interface SeriesCancelDialogData {
  /** Active, not-yet-ended bookings of the series, including this one. */
  upcomingInSeries: number;
}

export interface SeriesCancelDialogResult {
  scope: SeriesScope;
  reason: string;
}

@Component({
  selector: 'app-series-cancel-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    TranslatePipe,
    SeriesScopePickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'RESERVATION_SERIES.CANCEL_TITLE' | translate }}</h2>

    <mat-dialog-content class="fields">
      @if (data.upcomingInSeries > 1) {
        <app-series-scope-picker [(scope)]="scope" [upcomingCount]="data.upcomingInSeries" />
      }

      <mat-form-field appearance="outline">
        <mat-label>{{ 'RESERVATION_DETAIL.CANCELLATION_REASON_OPTIONAL' | translate }}</mat-label>
        <textarea matInput rows="2" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'COMMON.CLOSE' | translate }}</button>
      <button mat-flat-button color="warn" type="button" (click)="confirm()">
        {{ 'RESERVATION_DETAIL.CANCEL_BOOKING' | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `.fields { display: flex; flex-direction: column; gap: 16px; min-width: min(420px, 80vw); }`,
})
export class SeriesCancelDialogComponent {
  protected data = inject<SeriesCancelDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<SeriesCancelDialogComponent, SeriesCancelDialogResult>>(MatDialogRef);

  scope = signal<SeriesScope>('THIS');
  reason = signal('');

  confirm(): void {
    this.dialogRef.close({ scope: this.scope(), reason: this.reason().trim() });
  }
}
