import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../core/services/language.service';
import { SeoService } from '../../core/services/seo.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PublicWorkspaceDirectory } from '../../core/models/workspace.model';
import {
  workspaceBusinessTypes,
} from '../../core/mock/public-workspaces.mock';
import { AuthService } from '../../services/auth.service';

interface PublicPlanOption {
  id: 'FREE' | 'PRO' | 'ENTERPRISE';
  featured?: boolean;
  priceMonthlyUsd: number;
  priceYearlyUsd: number;
  titleKey: string;
  subtitleKey: string;
  ctaKey: string;
  featureKeys: string[];
}

@Component({
  selector: 'app-public-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  templateUrl: './public-home.component.html',
  styleUrl: './public-home.component.scss',
})
export class PublicHomeComponent implements AfterViewInit, OnDestroy {
  private hostElement = inject(ElementRef<HTMLElement>);
  private workspaceService = inject(WorkspaceService);
  private snack = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private seo = inject(SeoService);
  private authService = inject(AuthService);
  readonly languageService = inject(LanguageService);
  private observer?: IntersectionObserver;

  readonly currentUser = toSignal(this.authService.user$, { initialValue: null });
  readonly isLoggedIn = computed(() => !!this.currentUser());

  selectedVisibility = signal<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  search = signal('');
  selectedBusinessType = signal('All');

  readonly businessTypes = workspaceBusinessTypes;
  readonly businessTypeOptions = ['All', ...workspaceBusinessTypes];
  readonly publicWorkspaces = toSignal(
    this.workspaceService.listPublicDirectory(),
    { initialValue: [] as PublicWorkspaceDirectory[] },
  );

  readonly filteredPublicWorkspaces = computed(() => {
    const term = this.search().trim().toLowerCase();
    const selectedType = this.selectedBusinessType();

    return this.publicWorkspaces().filter((workspace) => {
      const matchesType = selectedType === 'All' || this.matchesBusinessType(workspace.businessType, selectedType);
      if (!matchesType) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        workspace.name,
        workspace.businessType ?? 'Other',
        workspace.address ?? '',
        workspace.timezone,
        workspace.currency,
        workspace.phone ?? '',
        workspace.whishNumber ?? '',
        workspace.websiteUrl ?? '',
        workspace.instagramUrl ?? '',
        workspace.facebookUrl ?? '',
        workspace.tiktokUrl ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  });

  // readonly topWorkspaces = publicWorkspacesMock.slice(0, 8);
  readonly activeVisibilityCopy = computed(() => {
    if (this.selectedVisibility() === 'PUBLIC') {
      return {
        titleKey: 'PUBLIC_HOME.VISIBILITY_PUBLIC_TITLE',
        subtitleKey: 'PUBLIC_HOME.VISIBILITY_PUBLIC_SUBTITLE',
      };
    }

    return {
      titleKey: 'PUBLIC_HOME.VISIBILITY_PRIVATE_TITLE',
      subtitleKey: 'PUBLIC_HOME.VISIBILITY_PRIVATE_SUBTITLE',
    };
  });

  // readonly filteredTopWorkspaces = computed(() => {
  //   const term = this.search().trim().toLowerCase();
  //   const category = this.categoryFilter();

  //   return this.topWorkspaces.filter((workspace) => {
  //     const categoryMatch = category === 'All categories' || workspace.category === category;
  //     if (!categoryMatch) {
  //       return false;
  //     }

  //     if (!term) {
  //       return true;
  //     }

  //     const searchableText = [
  //       workspace.name,
  //       workspace.category,
  //       workspace.location,
  //       workspace.description,
  //       workspace.tags.join(' '),
  //     ]
  //       .join(' ')
  //       .toLowerCase();

  //     return searchableText.includes(term);
  //   });
  // });

  // readonly stats = [
  //   { value: '12K+', label: 'Monthly Reservations' },
  //   { value: '2,600+', label: 'Public Workspaces' },
  //   { value: '98.7%', label: 'Owner Satisfaction' },
  // ];

  readonly features = [
    { icon: 'bolt', titleKey: 'PUBLIC_HOME.FEATURE_EASY_SETUP_TITLE', descriptionKey: 'PUBLIC_HOME.FEATURE_EASY_SETUP_DESC' },
    {
      icon: 'schedule',
      titleKey: 'PUBLIC_HOME.FEATURE_SMART_AVAILABILITY_TITLE',
      descriptionKey: 'PUBLIC_HOME.FEATURE_SMART_AVAILABILITY_DESC',
    },
    {
      icon: 'event_available',
      titleKey: 'PUBLIC_HOME.FEATURE_RESERVATIONS_TITLE',
      descriptionKey: 'PUBLIC_HOME.FEATURE_RESERVATIONS_DESC',
    },
    {
      icon: 'travel_explore',
      titleKey: 'PUBLIC_HOME.FEATURE_PUBLIC_DISCOVERY_TITLE',
      descriptionKey: 'PUBLIC_HOME.FEATURE_PUBLIC_DISCOVERY_DESC',
    },
    {
      icon: 'lock',
      titleKey: 'PUBLIC_HOME.FEATURE_PRIVATE_ACCESS_TITLE',
      descriptionKey: 'PUBLIC_HOME.FEATURE_PRIVATE_ACCESS_DESC',
    },
    {
      icon: 'share',
      titleKey: 'PUBLIC_HOME.FEATURE_SHAREABLE_PAGE_TITLE',
      descriptionKey: 'PUBLIC_HOME.FEATURE_SHAREABLE_PAGE_DESC',
    },
    {
      icon: 'calendar_month',
      titleKey: 'PUBLIC_HOME.FEATURE_CALENDAR_TITLE',
      descriptionKey: 'PUBLIC_HOME.FEATURE_CALENDAR_DESC',
    },
    // {
    //   icon: 'notifications',
    //   title: 'Notifications',
    //   description: 'Keep users informed about bookings and updates.',
    // },
  ];

  readonly pricingPlans: PublicPlanOption[] = [
    {
      id: 'FREE',
      priceMonthlyUsd: 0,
      priceYearlyUsd: 0,
      titleKey: 'PUBLIC_HOME.PLAN_FREE_TITLE',
      subtitleKey: 'PUBLIC_HOME.PLAN_FREE_SUBTITLE',
      ctaKey: 'PUBLIC_HOME.PLAN_FREE_CTA',
      featureKeys: [
        'PUBLIC_HOME.PLAN_FREE_FEATURE_1',
        'PUBLIC_HOME.PLAN_FREE_FEATURE_2',
        'PUBLIC_HOME.PLAN_FREE_FEATURE_3',
        'PUBLIC_HOME.PLAN_FREE_FEATURE_4',
      ],
    },
    {
      id: 'PRO',
      featured: true,
      priceMonthlyUsd: 19,
      priceYearlyUsd: 190,
      titleKey: 'PUBLIC_HOME.PLAN_PRO_TITLE',
      subtitleKey: 'PUBLIC_HOME.PLAN_PRO_SUBTITLE',
      ctaKey: 'PUBLIC_HOME.PLAN_PRO_CTA',
      featureKeys: [
        'PUBLIC_HOME.PLAN_PRO_FEATURE_1',
        'PUBLIC_HOME.PLAN_PRO_FEATURE_2',
        'PUBLIC_HOME.PLAN_PRO_FEATURE_3',
        'PUBLIC_HOME.PLAN_PRO_FEATURE_4',
      ],
    },
    {
      id: 'ENTERPRISE',
      priceMonthlyUsd: 79,
      priceYearlyUsd: 790,
      titleKey: 'PUBLIC_HOME.PLAN_ENTERPRISE_TITLE',
      subtitleKey: 'PUBLIC_HOME.PLAN_ENTERPRISE_SUBTITLE',
      ctaKey: 'PUBLIC_HOME.PLAN_ENTERPRISE_CTA',
      featureKeys: [
        'PUBLIC_HOME.PLAN_ENTERPRISE_FEATURE_1',
        'PUBLIC_HOME.PLAN_ENTERPRISE_FEATURE_2',
        'PUBLIC_HOME.PLAN_ENTERPRISE_FEATURE_3',
        'PUBLIC_HOME.PLAN_ENTERPRISE_FEATURE_4',
      ],
    },
  ];

  constructor() {
    effect(() => {
      const lang = this.languageService.language();
      const isArabic = lang === 'ar';
      const canonicalPath = '/';
      const title = isArabic
        ? 'إدارة الحجوزات ومساحات العمل'
        : 'Find and Book Workspaces';
      const description = isArabic
        ? 'اكتشف وقارن واحجز المساحات والشاليهات والمخيمات مع توفر فوري.'
        : 'Discover, compare, and book workspaces, chalets, camps, and venues with real-time availability.';

      this.seo.setPageSeo({
        title,
        description,
        canonicalPath,
        robots: 'index, follow',
        ogType: 'website',
      });

      this.seo.setStructuredDataGraph([
        {
          '@type': 'WebSite',
          name: 'StayManager',
          url: 'https://staymanager-15f31.web.app/',
          inLanguage: isArabic ? 'ar' : 'en',
          description,
        },
        {
          '@type': 'Organization',
          name: 'StayManager',
          url: 'https://staymanager-15f31.web.app/',
          logo: 'https://staymanager-15f31.web.app/logo.png',
        },
        {
          '@type': 'WebPage',
          name: title,
          url: 'https://staymanager-15f31.web.app/',
          inLanguage: isArabic ? 'ar' : 'en',
          description,
        },
      ]);
    });

    effect(() => {
      // Re-bind reveal observer when async workspace cards are rendered.
      this.filteredPublicWorkspaces().length;
      if (!this.observer) return;
      queueMicrotask(() => this.observeRevealNodes());
    });
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.22 },
    );

    this.observeRevealNodes();
  }

  private observeRevealNodes(): void {
    const revealNodes = this.hostElement.nativeElement.querySelectorAll('.reveal:not(.is-visible)');
    revealNodes.forEach((node: Element) => this.observer?.observe(node));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.seo.clearPageSeo();
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  onCategoryChange(event: Event): void {
    this.selectedBusinessType.set((event.target as HTMLSelectElement).value);
  }

  setVisibility(mode: 'PUBLIC' | 'PRIVATE'): void {
    this.selectedVisibility.set(mode);
  }

  trackByPublicWorkspace(_: number, workspace: PublicWorkspaceDirectory): string {
    return workspace.workspaceId;
  }

  externalUrl(raw: string | null | undefined): string {
    const value = String(raw ?? '').trim();
    if (!value) {
      return '#';
    }

    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }

  telUrl(raw: string | null | undefined): string {
    const normalized = String(raw ?? '').replace(/[^\d+]/g, '');
    return normalized ? `tel:${normalized}` : '#';
  }

  whatsappUrl(raw: string | null | undefined): string {
    const normalized = String(raw ?? '').replace(/\D/g, '');
    return normalized ? `https://wa.me/${normalized}` : '#';
  }

  whishDisplay(raw: string | null | undefined): string {
    const value = String(raw ?? '').trim();
    return value || '';
  }

  async copyWhishNumber(raw: string | null | undefined): Promise<void> {
    const value = this.whishDisplay(raw);
    if (!value) {
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('input');
        input.value = value;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }

      this.snack.open(this.t('PUBLIC_HOME.WHISH_COPIED'), this.t('COMMON.CLOSE'), { duration: 2600 });
    } catch {
      this.snack.open(this.t('PUBLIC_HOME.WHISH_COPY_FAILED'), this.t('COMMON.CLOSE'), { duration: 4500 });
    }
  }

  mapsUrl(workspace: PublicWorkspaceDirectory): string {
    const latitude = Number(workspace.latitude);
    const longitude = Number(workspace.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return `https://www.google.com/maps?q=${latitude},${longitude}`;
    }

    const value = String(workspace.address ?? '').trim();
    return value ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}` : '#';
  }

  private matchesBusinessType(workspaceType: string | null | undefined, selectedType: string): boolean {
    if (!workspaceType || !selectedType || selectedType === 'All') {
      return true;
    }

    return this.normalizeBusinessValue(workspaceType) === this.normalizeBusinessValue(selectedType);
  }

  private normalizeBusinessValue(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  businessTypeLabelKey(type: string): string {
    const key = type.toUpperCase().replaceAll(' ', '_');
    const known = new Set([
      'GUEST_HOUSE',
      'FOOTBALL_COURT',
      'PADEL_COURT',
      'RESTAURANT',
      'SALON',
      'CLINIC',
      'EVENT',
    ]);
    return known.has(key)
      ? `PUBLIC_HOME.BUSINESS_TYPE_${key}`
      : 'PUBLIC_HOME.BUSINESS_TYPE_OTHER';
  }

  businessTypeDescriptionKey(type: string): string {
    const key = type.toUpperCase().replaceAll(' ', '_');
    const known = new Set([
      'GUEST_HOUSE',
      'FOOTBALL_COURT',
      'PADEL_COURT',
      'RESTAURANT',
      'SALON',
      'CLINIC',
      'EVENT',
    ]);
    return known.has(key)
      ? `PUBLIC_HOME.BUSINESS_DESC_${key}`
      : 'PUBLIC_HOME.BUSINESS_DESC_OTHER';
  }

  private t(key: string): string {
    return this.translate.instant(key);
  }
}
