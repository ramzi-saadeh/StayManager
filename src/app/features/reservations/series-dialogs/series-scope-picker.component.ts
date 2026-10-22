import { Component, input, model } from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import { TranslatePipe } from '@ngx-translate/core';
import { SeriesScope } from '../../../core/models/recurrence.model';

@Component({
  selector: 'app-series-scope-picker',
  standalone: true,
  imports: [MatRadioModule, TranslatePipe],
  template: `
    <mat-radio-group
      class="scope"
      [attr.aria-label]="'RESERVATION_SERIES.SCOPE_LABEL' | translate"
      [value]="scope()"
      (change)="scope.set($event.value)">
      <mat-radio-button value="THIS">{{ 'RESERVATION_SERIES.SCOPE_THIS' | translate }}</mat-radio-button>
      <mat-radio-button value="SERIES">
        {{ 'RESERVATION_SERIES.SCOPE_SERIES' | translate:{ count: upcomingCount() } }}
      </mat-radio-button>
    </mat-radio-group>
  `,
  styles: `.scope { display: flex; flex-direction: column; }`,
})
export class SeriesScopePickerComponent {
  scope = model<SeriesScope>('THIS');
  /** Bookings a SERIES scope would affect, including the current one. */
  upcomingCount = input.required<number>();
}
