import { ApplicationConfig, provideZonelessChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideNativeDateAdapter } from '@angular/material/core';

const firebaseConfig = {
  apiKey: "AIzaSyBop8I_OCvDvXIk8ApGlGANN4gyGNsCsMY",
  authDomain: "kafar-banin-2025.firebaseapp.com",
  projectId: "kafar-banin-2025",
  storageBucket: "kafar-banin-2025.firebasestorage.app",
  messagingSenderId: "31322972420",
  appId: "1:31322972420:web:0c92b9c73cf805dc77f051"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: './i18n/',
        suffix: '.json',
      }),
      fallbackLang: 'ar',
    }),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideNativeDateAdapter(),
  ]
};
