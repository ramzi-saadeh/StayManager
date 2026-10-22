import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { AuthService } from '../../services/auth.service';

@Injectable({ providedIn: 'root' })
export class PlatformAdminService {
  private auth = inject(AuthService);
  private firestore = inject(Firestore);

  readonly isSuperAdmin = toSignal(
    this.auth.user$.pipe(
      switchMap((user) => {
        const uid = user?.uid;
        if (!uid) return of(false);
        return docData(doc(this.firestore, `platformAdmins/${uid}`) as any).pipe(
          map((entry) => !!entry),
        );
      }),
    ),
    { initialValue: false },
  );
}
