import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router, ActivatedRouteSnapshot } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface SeoRouteData {
  title?: string;
  description?: string;
  robots?: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  imageUrl?: string;
}

interface SeoState {
  title: string;
  description: string;
  robots: string;
  canonicalUrl: string;
  ogType: 'website' | 'article';
  imageUrl: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private router = inject(Router);
  private title = inject(Title);
  private meta = inject(Meta);
  private document = inject(DOCUMENT);

  private initialized = false;
  private pageOverride: Partial<SeoRouteData> | null = null;
  private structuredDataGraphOverride: Array<Record<string, unknown>> | null = null;

  private readonly brandName = 'StayManager';
  private readonly defaultDescription =
    'StayManager helps teams manage workspaces, bookings, calendars, resources, and guest stays from one platform.';
  private readonly defaultRobots = 'index, follow';
  private readonly defaultOgType: SeoState['ogType'] = 'website';
  private readonly defaultImagePath = '/images/hero-bg-new.png';

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.applySeo();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.applySeo());
  }

  setPageSeo(data: Partial<SeoRouteData>): void {
    this.pageOverride = { ...data };
    this.applySeo();
  }

  clearPageSeo(): void {
    if (!this.pageOverride && !this.structuredDataGraphOverride) {
      return;
    }

    this.pageOverride = null;
    this.structuredDataGraphOverride = null;
    this.applySeo();
  }

  setStructuredDataGraph(graph: Array<Record<string, unknown>>): void {
    this.structuredDataGraphOverride = graph;
    this.applySeo();
  }

  private applySeo(): void {
    const routeSnapshot = this.getLeafSnapshot(this.router.routerState.snapshot.root);
    const data = this.mergeSeoData(routeSnapshot);

    const merged = {
      ...data,
      ...(this.pageOverride ?? {}),
    };

    const pageTitle = merged.title
      ? `${merged.title} | ${this.brandName}`
      : this.brandName;
    const description = merged.description ?? this.defaultDescription;
    const robots = merged.robots ?? this.defaultRobots;
    const canonicalUrl = this.buildCanonicalUrl(merged.canonicalPath);
    const ogType = merged.ogType ?? this.defaultOgType;
    const imageUrl = this.resolveImageUrl(merged.imageUrl ?? this.defaultImagePath, canonicalUrl);

    const seoState: SeoState = {
      title: pageTitle,
      description,
      robots,
      canonicalUrl,
      ogType,
      imageUrl,
    };

    this.title.setTitle(seoState.title);
    this.updateNameTag('description', seoState.description);
    this.updateNameTag('robots', seoState.robots);
    this.updateNameTag('twitter:card', 'summary_large_image');
    this.updateNameTag('twitter:title', seoState.title);
    this.updateNameTag('twitter:description', seoState.description);
    this.updateNameTag('twitter:image', seoState.imageUrl);

    this.updatePropertyTag('og:title', seoState.title);
    this.updatePropertyTag('og:description', seoState.description);
    this.updatePropertyTag('og:type', seoState.ogType);
    this.updatePropertyTag('og:url', seoState.canonicalUrl);
    this.updatePropertyTag('og:image', seoState.imageUrl);
    this.updatePropertyTag('og:site_name', this.brandName);

    this.updateCanonicalLink(seoState.canonicalUrl);
    this.updateStructuredData(seoState);
  }

  private mergeSeoData(snapshot: ActivatedRouteSnapshot): SeoRouteData {
    return snapshot.pathFromRoot.reduce<SeoRouteData>((acc, current) => {
      const routeData = current.data as SeoRouteData;
      if (!routeData) {
        return acc;
      }

      return {
        ...acc,
        ...routeData,
      };
    }, {});
  }

  private getLeafSnapshot(snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let current = snapshot;
    while (current.firstChild) {
      current = current.firstChild;
    }
    return current;
  }

  private buildCanonicalUrl(canonicalPath?: string): string {
    const configuredBase = (environment.siteUrl ?? '').replace(/\/$/, '');
    const locationOrigin = this.document.location?.origin ?? '';
    const origin = configuredBase || locationOrigin;

    const path = (canonicalPath ?? this.router.url)
      .split('?')[0]
      .split('#')[0]
      .trim();

    if (!origin) {
      return path || '/';
    }

    if (!path || path === '/') {
      return `${origin}/`;
    }

    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private updateCanonicalLink(url: string): void {
    let canonical = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }

    canonical.setAttribute('href', url);
  }

  private updateNameTag(name: string, content: string): void {
    this.meta.updateTag({ name, content });
  }

  private updatePropertyTag(property: string, content: string): void {
    this.meta.updateTag({ property, content });
  }

  private updateStructuredData(seoState: SeoState): void {
    const scriptId = 'sm-seo-ld-json';
    let script = this.document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = this.document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }

    const defaultGraph: Array<Record<string, unknown>> = [
      {
        '@type': 'WebSite',
        name: this.brandName,
        url: this.getSiteRoot(seoState.canonicalUrl),
        description: this.defaultDescription,
      },
      {
        '@type': 'SoftwareApplication',
        name: this.brandName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: seoState.canonicalUrl,
        description: seoState.description,
      },
    ];

    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': this.structuredDataGraphOverride ?? defaultGraph,
    };

    script.textContent = JSON.stringify(structuredData);
  }

  private getSiteRoot(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}/`;
    } catch {
      return '/';
    }
  }

  private resolveImageUrl(imagePathOrUrl: string, canonicalUrl: string): string {
    if (/^https?:\/\//i.test(imagePathOrUrl)) {
      return imagePathOrUrl;
    }

    const siteRoot = this.getSiteRoot(canonicalUrl).replace(/\/$/, '');
    const normalizedPath = imagePathOrUrl.startsWith('/') ? imagePathOrUrl : `/${imagePathOrUrl}`;
    return `${siteRoot}${normalizedPath}`;
  }
}
