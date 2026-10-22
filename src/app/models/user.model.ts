export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    phoneNumber?: string | null;
    photoURL: string | null;
    emailVerified: boolean;
}
