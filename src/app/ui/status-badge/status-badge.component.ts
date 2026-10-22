import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReservationStatus, PaymentStatus } from '../../core/models/enums';

type BadgeVariant = ReservationStatus | PaymentStatus | 'FREE' | 'PRO' | 'ENTERPRISE' | string;

@Component({
  selector: 'app-status-badge',
  imports: [CommonModule],
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  status = input.required<BadgeVariant>();
  size   = input<'sm' | 'md'>('md');

  cssClass = computed(() => {
    const map: Record<string, string> = {
      CONFIRMED:   'confirmed',
      PENDING:     'pending',
      COMPLETED:   'completed',
      CANCELLED:   'cancelled',
      DELETED:     'neutral',
      PAID:        'confirmed',
      PARTIAL:     'pending',
      UNPAID:      'error',
      REFUNDED:    'neutral',
      FREE:        'neutral',
      PRO:         'primary',
      ENTERPRISE:  'purple',
    };
    return map[this.status()] ?? 'neutral';
  });

  displayText = computed(() => {
    return this.status().replace(/_/g, ' ');
  });
}
