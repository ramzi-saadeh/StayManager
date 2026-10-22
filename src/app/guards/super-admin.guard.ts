import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Firestore, doc, docData } from '@angular/fire/firestore';

export const superAdminGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const firestore = inject(Firestore);

  return auth.user$.pipe(
    take(1),
    switchMap((user) => {
      const uid = user?.uid;
      if (!uid) return of(router.createUrlTree(['/login']));

      return docData(doc(firestore, `platformAdmins/${uid}`) as any).pipe(
        take(1),
        map((entry) => entry ? true : router.createUrlTree(['/dashboard'])),
      );
    }),
  );
};
