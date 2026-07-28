import { Injectable, inject } from '@angular/core';
import {
    Auth,
    authState,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
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
    }

    async loginWithEmail(email: string, pass: string): Promise<void> {
        await signInWithEmailAndPassword(this.auth, email, pass);
    }

    async logout(): Promise<void> {
        await signOut(this.auth);
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
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified
        };
    }
}
