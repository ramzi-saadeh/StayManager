import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from './services/language.service';
import { AuthService } from './services/auth.service';
import { CommonModule } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { filter, map } from 'rxjs/operators';
import { OptimizedImageDirective } from './directives/optimized-image.directive';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe,
    CommonModule,
    OptimizedImageDirective
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

  isMenuOpen = false;

  constructor(
    public languageService: LanguageService,
    public authService: AuthService,
    private router: Router,
    private titleService: Title,
    private metaService: Meta,
    private translate: TranslateService,
    private activatedRoute: ActivatedRoute
  ) {
    this.setupSeo();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu() {
    this.isMenuOpen = false;
  }

  private setupSeo() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => {
        let child = this.activatedRoute.firstChild;
        while (child?.firstChild) {
          child = child.firstChild;
        }
        if (child?.snapshot.data['titleKey']) {
          return child.snapshot.data;
        }
        return null;
      })
    ).subscribe((data: any) => {
      if (data) {
        this.translate.get([data.titleKey, data.descriptionKey]).subscribe(translations => {
          this.titleService.setTitle(`${translations[data.titleKey]} | ${translations[data.descriptionKey]}`);
          this.metaService.updateTag({ name: 'description', content: translations[data.descriptionKey] });
          this.metaService.updateTag({ property: 'og:title', content: translations[data.titleKey] });
          this.metaService.updateTag({ property: 'og:description', content: translations[data.descriptionKey] });
        });
      }
    });
  }

  logout(): void {
    this.authService.logout().then(() => {
      this.router.navigate(['/']);
    });
  }
}
