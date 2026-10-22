import { Component, inject, signal, effect } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { BidiModule } from '@angular/cdk/bidi';
import { TranslatePipe } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopnavComponent } from './topnav/topnav.component';
import { LanguageService } from '../core/services/language.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatIconModule, CommonModule, BidiModule, TranslatePipe, SidebarComponent, TopnavComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private breakpointObserver = inject(BreakpointObserver);
  readonly languageService = inject(LanguageService);

  isMobile = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  sidebarCollapsed = signal(false);
  sidenavOpened = signal(true);

  direction() {
    return this.languageService.language() === 'ar' ? 'rtl' : 'ltr';
  }

  constructor() {
    effect(() => {
      if (this.isMobile()) {
        this.sidenavOpened.set(false);
      } else {
        this.sidenavOpened.set(true);
      }
    });
  }

  toggleSidebar() {
    if (this.isMobile()) {
      this.sidenavOpened.update((v) => !v);
    } else {
      this.sidebarCollapsed.update((v) => !v);
    }
  }

  closeSidenav() {
    this.sidenavOpened.set(false);
  }

  onSidenavOpenedChange(opened: boolean) {
    this.sidenavOpened.set(opened);
  }
}
