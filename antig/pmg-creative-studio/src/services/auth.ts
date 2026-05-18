import {
    OAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    type User
} from 'firebase/auth';
import { auth } from '../firebase';

// OIDC Provider ID for Alli (as configured in Firebase Console)
const ALLI_OIDC_PROVIDER_ID = 'oidc.alli';

export class AuthService {
    private static instance: AuthService;
    private providerToken: string | null = null;

    private constructor() {
        // Load token from session storage if it exists (for persistence across refreshes)
        this.providerToken = sessionStorage.getItem('alli_access_token');
    }

    public static getInstance(): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    /**
     * Initializes OIDC flow via Firebase popup
     */
    async loginWithAlli(): Promise<User | null> {
        const provider = new OAuthProvider(ALLI_OIDC_PROVIDER_ID);
        provider.addScope('openid');
        provider.addScope('profile');
        provider.addScope('email');
        provider.addScope('central.read');

        try {
            const result = await signInWithPopup(auth, provider);

            // Capture the OIDC Access Token from the provider
            const credential = OAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                this.providerToken = credential.accessToken;
                sessionStorage.setItem('alli_access_token', credential.accessToken);
                console.log('Successfully captured Alli Access Token');
            }

            return result.user;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    /**
     * Logs out the current user
     */
    async logout(): Promise<void> {
        try {
            await signOut(auth);
            this.providerToken = null;
            sessionStorage.removeItem('alli_access_token');
            localStorage.removeItem('selectedClient');
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    /**
     * Listens for auth state changes
     */
    subscribe(callback: (user: User | null) => void) {
        return onAuthStateChanged(auth, callback);
    }

    /**
     * Returns the Alli Access Token (OIDC Token)
     * This is what we'll send to the Alli Central API
     */
    async getAccessToken(): Promise<string | null> {
        // If we have it in memory or session, return it
        if (this.providerToken) return this.providerToken;

        // Fallback: If not in memory (e.g. after hard refresh), we might need to re-auth
        // or use the Firebase ID token if the API supports it (but Alli usually wants the provider token)
        return sessionStorage.getItem('alli_access_token');
    }

    /**
     * Returns the Alli user identifier (OIDC `sub` claim) for the signed-in
     * user, suitable for use as `createdBy` on generated artifacts.
     *
     * Returns null when no user is signed in. THROWS when a user is signed in
     * but the `oidc.alli` provider data is missing — the only legitimate caller
     * path is post-OIDC-sign-in, so missing provider data indicates a real bug
     * (e.g. someone created a Firebase user without going through Alli). Throwing
     * prevents silently mis-attributing generations to the Firebase UID.
     *
     * See plan §self-review P1#4: "Implementation should switch to `throw` if
     * oidc.alli provider data is missing; the only legit caller path has it."
     */
    getAlliUserId(): string | null {
        const user = auth.currentUser;
        if (!user) return null;
        const oidc = user.providerData.find(p => p.providerId === 'oidc.alli');
        if (oidc?.uid) return oidc.uid;
        throw new Error(
            '[auth] getAlliUserId: signed-in user has no oidc.alli provider data. ' +
            'createdBy attribution would be wrong; refusing to fall back to Firebase UID. ' +
            'Ensure the sign-in flow completed via the Alli OIDC provider.'
        );
    }
}

export const authService = AuthService.getInstance();
