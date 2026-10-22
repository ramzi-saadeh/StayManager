import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { switchMap, map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../core/services/user.repository';

export const ownerGuard = () => {
  const authService = inject(AuthService);
  const userRepo = inject(UserRepository);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    switchMap((user) => {
      if (!user) {
        router.navigate(['/login']);
        return of(false);
      }

      return userRepo.get(user.uid).pipe(
        take(1),
        map((profile) => {
          if (profile?.role === 'owner') {
            return true;
          }

          router.navigate(['/dashboard']);
          return false;
        }),
      );
    }),
  );
};
