import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    TranslatePipe,
  ],
  template: `
    <div class="invite-page">
      <mat-card class="invite-card">
        <div class="invite-content">
          <mat-icon class="invite-icon">link_off</mat-icon>
          <h2>{{ 'ACCEPT_INVITE.UNAVAILABLE_TITLE' | translate }}</h2>
          <p>{{ 'ACCEPT_INVITE.UNAVAILABLE_DESCRIPTION' | translate }}</p>
        </div>
      </mat-card>
    </div>
  `,
  styles: [`
    .invite-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--sm-page-bg, #f1f5f9); padding: 24px; }
    .invite-card { max-width: 400px; width: 100%; border-radius: 16px !important; text-align: center; padding: 40px 32px; }
    .invite-content { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .invite-icon { font-size: 48px; width: 48px; height: 48px; color: var(--mat-sys-primary); }
  `],
})
export class AcceptInviteComponent {}
