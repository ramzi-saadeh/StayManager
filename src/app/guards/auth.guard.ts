import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, switchMap, take } from 'rxjs/operators';
import { of } from 'rxjs';
import { REQUIRE_EMAIL_VERIFICATION } from '../core/auth-policy';
import { UserRepository } from '../core/services/user.repository';

export const authGuard = () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const users = inject(UserRepository);

    return authService.user$.pipe(
        take(1),
        switchMap(user => {
            if (!user || (REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)) {
                return of(router.createUrlTree(['/login'], { queryParams: user ? { verify: '1' } : {} }));
            }
            const googleAccount = authService.getCurrentUser()?.providerData.some(provider => provider.providerId === 'google.com');
            if (!googleAccount) return of(true);
            return users.get(user.uid).pipe(
                take(1),
                map(profile => profile?.phoneNumber && profile.role
                    ? true : router.createUrlTree(['/login'], { queryParams: { complete: '1' } })),
                catchError(() => of(router.createUrlTree(['/login']))),
            );
        })
    );
};
