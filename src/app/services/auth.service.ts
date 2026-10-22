import { Injectable, inject } from '@angular/core';
import {
    Auth,
    authState,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    signOut,
    updateProfile,
    User as FirebaseUser
} from '@angular/fire/auth';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { User } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth: Auth = inject(Auth);

    // Observable of mapped user
    user$: Observable<User | null> = authState(this.auth).pipe(
        map(firebaseUser => this.mapFirebaseUser(firebaseUser))
    );

    constructor() { }

    async registerWithEmail(email: string, pass: string, name: string): Promise<void> {
        const credential = await createUserWithEmailAndPassword(this.auth, email, pass);
        await updateProfile(credential.user, { displayName: name });
        // Force token refresh for consistency — new users have no claims yet,
        // but this ensures the token is fresh before the workspaceGuard runs.
        await credential.user.getIdToken(/* forceRefresh */ true);
    }

    async loginWithEmail(email: string, pass: string): Promise<void> {
        // Always clear any stale session before sign-in so a previous customer
        // session cannot leak role/workspace state into the next account.
        if (this.auth.currentUser) {
            await signOut(this.auth);
        }

        const credential = await signInWithEmailAndPassword(this.auth, email, pass);
        // Force a token refresh and wait for the Firestore SDK to pick it up.
        // Without this the Firestore security rules deny the workspaceMembers
        // query immediately after login due to stale token state.
        await credential.user.getIdToken(/* forceRefresh */ true);
        // Give the Firestore SDK time to apply the refreshed token internally.
        await new Promise((resolve) => setTimeout(resolve, 300));
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
