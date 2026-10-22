import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../core/services/user.repository';

export const customerGuard = () => {
  const auth = inject(AuthService);
  const userRepo = inject(UserRepository);
  const router = inject(Router);
  const user = auth.getCurrentUser();

  if (!user) return router.createUrlTree(['/login']);

  return userRepo.get(user.uid).pipe(
    take(1),
    map((profile) =>
      profile?.role === 'owner' ? router.createUrlTree(['/dashboard']) : true,
    ),
  );
};
