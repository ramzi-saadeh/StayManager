import { DOCUMENT } from '@angular/common';
import { OverlayContainer } from '@angular/cdk/overlay';
import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';

export type AppLanguage = 'en' | 'ar';

interface LanguageOption {
  code: AppLanguage;
  label: string;
  dir: 'ltr' | 'rtl';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private translate = inject(TranslateService);
  private document = inject(DOCUMENT);
  private router = inject(Router);
  private overlayContainer = inject(OverlayContainer);

  private readonly storageKey = 'sm_preferred_language';
  private readonly selectedLanguage = signal<AppLanguage>('en');
  private currentScope: 'public-home' | 'app' = this.resolveScope(this.router.url);

  readonly language = this.selectedLanguage.asReadonly();
  readonly languages: ReadonlyArray<LanguageOption> = [
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'ar', label: 'العربية', dir: 'rtl' },
  ];

  init(): void {
    const saved = this.readStoredLanguage();
    const initial = saved ?? this.resolveBrowserLanguage();
    this.applyLanguage(initial, false);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.reloadLanguageForScopeChange(event.urlAfterRedirects));
  }

  setLanguage(lang: AppLanguage): void {
    this.applyLanguage(lang, true);
  }

  private applyLanguage(lang: AppLanguage, persist: boolean): void {
    const normalized = this.normalize(lang);
    const current = this.selectedLanguage();

    // Prevent duplicate toggles when controls emit the same value repeatedly.
    if (normalized === current) {
      this.syncDirectionAttributes(normalized);
      if (persist) {
        localStorage.setItem(this.storageKey, normalized);
      }
      return;
    }

    this.selectedLanguage.set(normalized);
    this.translate.use(normalized);
    this.syncDirectionAttributes(normalized);

    if (persist) {
      localStorage.setItem(this.storageKey, normalized);
    }
  }

  private readStoredLanguage(): AppLanguage | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    return this.normalize(raw);
  }

  private resolveBrowserLanguage(): AppLanguage {
    const browserLang = this.document.defaultView?.navigator?.language?.toLowerCase() ?? '';
    return browserLang.startsWith('ar') ? 'ar' : 'en';
  }

  private reloadLanguageForScopeChange(url: string): void {
    const nextScope = this.resolveScope(url);
    if (nextScope === this.currentScope) {
      return;
    }

    this.currentScope = nextScope;
    const lang = this.selectedLanguage();
    this.translate.resetLang(lang);
    this.translate.use(lang);
    this.syncDirectionAttributes(lang);
  }

  private syncDirectionAttributes(lang: AppLanguage): void {
    const html = this.document.documentElement;
    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    html.lang = lang;
    html.dir = dir;

    const overlayRoot = this.overlayContainer.getContainerElement();
    overlayRoot.setAttribute('dir', dir);
    overlayRoot.setAttribute('lang', lang);
  }

  private resolveScope(url: string): 'public-home' | 'app' {
    const path = url.split('?')[0].split('#')[0];
    return path === '' || path === '/' ? 'public-home' : 'app';
  }

  private normalize(value: string | null | undefined): AppLanguage {
    return String(value ?? '').toLowerCase() === 'ar' ? 'ar' : 'en';
  }
}