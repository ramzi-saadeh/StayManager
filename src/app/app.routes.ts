import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/home/home.component').then((m) => m.HomeComponent),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'HOME.SUBTITLE' },
  },
  {
    path: 'kafar-banin',
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'COMMON.LOGIN' },
  },
  {
    path: 'persons',
    loadComponent: () =>
      import('./components/person-management/person-management.component').then(
        (m) => m.PersonManagementComponent,
      ),
    canActivate: [authGuard],
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.PERSONS' },
  },
  {
    path: 'projects/:id',
    loadComponent: () =>
      import('./components/projects/project-detail/project-detail.component').then(
        (m) => m.ProjectDetailComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'COMMON.LOADING' },
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./components/projects/projects.component').then((m) => m.ProjectsComponent),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.PROJECTS' },
  },
  {
    path: 'complaints',
    loadComponent: () =>
      import('./components/complaints/complaints.component').then((m) => m.ComplaintsComponent),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.COMPLAINTS' },
  },
  // {
  //     path: 'news',
  //     loadComponent: () => import('./components/news/news.component').then(m => m.NewsComponent),
  //     data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.NEWS' }
  // },
  {
    path: 'tourist-places',
    loadComponent: () =>
      import('./components/tourist-places/tourist-places.component').then(
        (m) => m.TouristPlacesComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.TOURIST' },
  },
  // {
  //     path: 'associations',
  //     loadComponent: () => import('./components/associations/associations.component').then(m => m.AssociationsComponent),
  //     data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.ASSOCIATIONS' }
  // },
  {
    path: 'documents/complaint-form',
    loadComponent: () =>
      import('./components/documents/complaint-form/complaint-form.component').then(
        (m) => m.ComplaintFormComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'DOCUMENTS.COMPLAINT_FORM.TITLE' },
  },
  {
    path: 'documents/disability-exemption-form',
    loadComponent: () =>
      import('./components/documents/disability-exemption-form/disability-exemption-form.component').then(
        (m) => m.DisabilityExemptionFormComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'DOCUMENTS.DISABILITY_FORM.TITLE' },
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('./components/documents/documents.component').then((m) => m.DocumentsComponent),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.DOCUMENTS' },
  },
  {
    path: 'transparency',
    loadComponent: () =>
      import('./components/transparency/transparency.component').then(
        (m) => m.TransparencyComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.TRANSPARENCY' },
  },
  {
    path: 'members',
    loadComponent: () =>
      import('./components/municipality-members/municipality-members').then(
        (m) => m.MunicipalityMembers,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'NAV.MEMBERS' },
  },
  {
    path: 'blood-donors',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./components/blood-donor/blood-donor-list/blood-donor-list.component').then(
            (m) => m.BloodDonorListComponent,
          ),
        data: { titleKey: 'HOME.TITLE', descriptionKey: 'BLOOD_DONOR.TITLE' },
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./components/blood-donor/blood-donor-form/blood-donor-form.component').then(
            (m) => m.BloodDonorFormComponent,
          ),
        data: { titleKey: 'HOME.TITLE', descriptionKey: 'BLOOD_DONOR.FORM.TITLE_ADD' },
      },
      {
        path: 'edit/:id',
        loadComponent: () =>
          import('./components/blood-donor/blood-donor-form/blood-donor-form.component').then(
            (m) => m.BloodDonorFormComponent,
          ),
        data: { titleKey: 'HOME.TITLE', descriptionKey: 'BLOOD_DONOR.FORM.TITLE_EDIT' },
      },
    ],
  },
  {
    path: 'water-distribution',
    loadComponent: () =>
      import('./components/water-distribution/water-distribution.component').then(
        (m) => m.WaterDistributionComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'WATER.TITLE' },
  },
  {
    path: 'land-map',
    loadComponent: () =>
      import('./components/land-map/land-map.component').then((m) => m.LandMapComponent),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'LAND.TITLE' },
  },
  {
    path: 'exhibition',
    loadComponent: () =>
      import('./components/exhibition-list/exhibition-list.component').then(
        (m) => m.ExhibitionListComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'EXHIBITION.LIST.TITLE' },
  },
  {
    path: 'exhibition/register',
    loadComponent: () =>
      import('./components/exhibition-registration/exhibition-registration.component').then(
        (m) => m.ExhibitionRegistrationComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'EXHIBITION.REGISTER.TITLE' },
  },
  {
    path: 'exhibition/business/:id',
    loadComponent: () =>
      import('./components/business-detail/business-detail.component').then(
        (m) => m.BusinessDetailComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'EXHIBITION.DETAIL.TITLE' },
  },
  {
    path: 'exhibition/print',
    loadComponent: () =>
      import('./components/exhibition-list/business-barcode/business-barcode.component').then(
        (m) => m.BusinessBarcodeComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'EXHIBITION.BARCODE.PAGE_TITLE' },
  },
  {
    path: 'exhibition/feedback',
    loadComponent: () =>
      import('./components/exhibition-feedback/exhibition-feedback.component').then(
        (m) => m.ExhibitionFeedbackComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'EXHIBITION.FEEDBACK.TITLE' },
  },
  {
    path: 'exhibition/results',
    loadComponent: () =>
      import('./components/exhibition-results/exhibition-results.component').then(
        (m) => m.ExhibitionResultsComponent,
      ),
    data: { titleKey: 'HOME.TITLE', descriptionKey: 'EXHIBITION.RESULTS.TITLE' },
  },
  {
    path: '**',
    redirectTo: '',
  },
];
