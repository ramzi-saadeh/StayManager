import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  imports: [MatIconModule, CommonModule],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
})
export class StatCardComponent {
  label    = input.required<string>();
  value    = input.required<string | number>();
  icon     = input<string>('analytics');
  trend    = input<number | null>(null);   // positive = up, negative = down
  trendLabel = input<string>('');
  accent   = input<'primary' | 'success' | 'warning' | 'error' | 'neutral'>('primary');
  loading  = input(false);
}
