import { Injectable, inject } from '@angular/core';
import {
    Auth,
    idToken,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification,
    sendPasswordResetEmail,
    reload,
    signOut,
    User as FirebaseUser
} from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { User } from '../models/user.model';
import { AccountRole } from '../core/models/user.model';
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from 'firebase/auth';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth: Auth = inject(Auth);
    private functions = inject(Functions);

    // Observable of mapped user
    user$: Observable<User | null> = idToken(this.auth).pipe(
        map(() => this.mapFirebaseUser(this.auth.currentUser))
    );

    constructor() { }

    async registerWithEmail(email: string, pass: string, name: string, phone: string, role: AccountRole, customerSearchConsent: boolean): Promise<void> {
        await httpsCallable(this.functions, 'registerAccount')({ email, password: pass, name, phone, role, customerSearchConsent });
        await setPersistence(this.auth, browserSessionPersistence);
        const credential = await signInWithEmailAndPassword(this.auth, email.trim().toLowerCase(), pass);
        // Force token refresh for consistency — new users have no claims yet,
        // but this ensures the token is fresh before the workspaceGuard runs.
        await credential.user.getIdToken(/* forceRefresh */ true);
    }

    async loginWithEmail(email: string, pass: string, remember = false): Promise<void> {
        // Always clear any stale session before sign-in so a previous customer
        // session cannot leak role/workspace state into the next account.
        if (this.auth.currentUser) {
            await signOut(this.auth);
        }

        await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
        const credential = await signInWithEmailAndPassword(this.auth, email.trim().toLowerCase(), pass);
        // Force a token refresh and wait for the Firestore SDK to pick it up.
        // Without this the Firestore security rules deny the workspaceMembers
        // query immediately after login due to stale token state.
        await credential.user.getIdToken(/* forceRefresh */ true);
        // Give the Firestore SDK time to apply the refreshed token internally.
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    async loginWithGoogle(remember = false): Promise<void> {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
        const credential = await signInWithPopup(this.auth, provider);
        await credential.user.getIdToken(true);
    }

    async completeGoogleProfile(name: string, phone: string, role: AccountRole, customerSearchConsent: boolean): Promise<void> {
        await httpsCallable(this.functions, 'completeGoogleAccount')({ name, phone, role, customerSearchConsent });
        await this.refreshCurrentUser();
    }

    async logout(): Promise<void> {
        if (this.auth.currentUser) {
            await signOut(this.auth);
        }
    }

    async sendVerificationEmail(): Promise<void> {
        const user = this.auth.currentUser;
        if (!user) throw new Error('Not authenticated');
        await sendEmailVerification(user);
    }

    async refreshCurrentUser(): Promise<boolean> {
        const user = this.auth.currentUser;
        if (!user) return false;
        await reload(user);
        await user.getIdToken(true);
        return user.emailVerified;
    }

    async requestPasswordReset(email: string): Promise<void> {
        try {
            await sendPasswordResetEmail(this.auth, email.trim().toLowerCase());
        } catch (error) {
            if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
        }
    }

    getCurrentUser(): FirebaseUser | null {
        return this.auth.currentUser;
    }

    private mapFirebaseUser(firebaseUser: FirebaseUser | null): User | null {
        if (!firebaseUser) return null;
        return {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            phoneNumber: firebaseUser.phoneNumber,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified
        };
    }
}
