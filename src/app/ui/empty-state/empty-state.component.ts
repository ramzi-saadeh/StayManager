import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule, MatButtonModule, RouterLink],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  icon        = input('inbox');
  title       = input.required<string>();
  description = input('');
  actionLabel = input('');
  actionIcon  = input('add');
  actionLink  = input('');           // router path e.g. '/resources/new'
  actionClick = output<void>();      // for cases that need custom click logic
}
