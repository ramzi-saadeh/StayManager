import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { filter, Subscription } from 'rxjs';
import { LanguageService, SeoService, ThemeService } from './core/services';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private languageService = inject(LanguageService);
  private seoService = inject(SeoService);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private authSub?: Subscription;
  private messageUnsubscribe?: () => void;

  constructor() {
    this.languageService.init();
    this.seoService.init();
    this.themeService;
  }

  ngOnInit(): void {
    if (!environment.useEmulators && 'Notification' in window) {
      this.listenForMessages();
    }

    this.authSub = this.authService.user$
      .pipe(filter((user) => !!user))
      .subscribe((user) => {
        this.setupPushNotifications(user!.uid);
      });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.messageUnsubscribe?.();
  }

  requestPermission(uid: string) {
    if (environment.useEmulators) return;
    if (!environment.messagingVapidKey) return;

    if (!('Notification' in window)) {
      return;
    }

    Notification.requestPermission().then(async (permission) => {
      if (permission === 'granted') await this.savePushToken(uid);
    });
  }

  private setupPushNotifications(uid: string): void {
    if (environment.useEmulators || !environment.messagingVapidKey || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      void this.savePushToken(uid);
      return;
    }
    if (Notification.permission !== 'default') return;

    this.snackBar
      .open(
        this.translate.instant('RESERVATION_NOTIFICATION.ENABLE_PROMPT'),
        this.translate.instant('RESERVATION_NOTIFICATION.ENABLE'),
        { duration: 10000 },
      )
      .onAction()
      .subscribe(() => this.requestPermission(uid));
  }

  private async savePushToken(uid: string): Promise<void> {
    try {
      const serviceWorkerUrl = new URL('/firebase-messaging-sw.js', window.location.origin);
      serviceWorkerUrl.searchParams.set('firebaseConfig', JSON.stringify(environment.firebase));
      const serviceWorkerRegistration = await navigator.serviceWorker.register(serviceWorkerUrl);
      const currentToken = await getToken(getMessaging(), {
        vapidKey: environment.messagingVapidKey,
        serviceWorkerRegistration,
      });
      if (!currentToken) return;

      await setDoc(
        doc(this.firestore, `users/${uid}/private/push`),
        { fcmToken: currentToken, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (error) {
      console.error('Could not register push notifications.', error);
    }
  }

  listenForMessages() {
    const messaging = getMessaging();
    this.messageUnsubscribe = onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? this.translate.instant('RESERVATION_NOTIFICATION.TITLE');
      const body = payload.notification?.body ?? '';
      const link = payload.data?.['link'];
      const snack = this.snackBar.open(
        [title, body].filter(Boolean).join(': '),
        this.translate.instant('RESERVATION_NOTIFICATION.VIEW'),
        { duration: 8000 },
      );
      snack.onAction().subscribe(() => {
        if (link) void this.router.navigateByUrl(link);
      });
    });
  }
}

