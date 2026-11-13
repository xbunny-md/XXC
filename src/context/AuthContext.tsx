import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  createUserProfileRecord,
  ProfileUpdatePayload,
  RegistrationPayload,
  resolvePrivacy,
  setUserOnlinePresence,
  updateOwnUserProfile,
  updatePrivacySettings,
  updateProfileMedia,
} from '../lib/userService';
import type { PrivacySettings, UserProfile } from '../types/luga';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  profileLoading: boolean;
  connectionOffline: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<User | null>;
  registerProfile: (payload: RegistrationPayload, explicitUser?: User | null) => Promise<void>;
  updateProfile: (updates: ProfileUpdatePayload) => Promise<void>;
  updateMedia: (media: { avatarUrl?: string; coverUrl?: string }) => Promise<void>;
  updatePrivacy: (privacy: PrivacySettings) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [connectionOffline, setConnectionOffline] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void testFirestoreConnection().then((res) => {
      if (res.offline) setConnectionOffline(true);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    setProfileLoading(true);
    const path = `users/${firebaseUser.uid}`;
    const unsubscribe = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfile;
          setProfile(data);
        } else {
          setProfile(null);
        }
        setProfileLoading(false);
      },
      (error) => {
        setProfileLoading(false);
        setAuthError('Unable to load your profile permissions. Please try again.');
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
    return () => unsubscribe();
  }, [authReady, firebaseUser]);

  // Real online/offline presence respecting user privacy settings
  useEffect(() => {
    if (!profile || profile.status !== 'approved') return;
    const showOnline = resolvePrivacy(profile).showOnlineStatus;
    void setUserOnlinePresence(profile.uid, true, showOnline);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void setUserOnlinePresence(profile.uid, false, showOnline);
      } else {
        void setUserOnlinePresence(profile.uid, true, showOnline);
      }
    };

    const handlePageHide = () => {
      void setUserOnlinePresence(profile.uid, false, showOnline);
    };

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void setUserOnlinePresence(profile.uid, true, showOnline);
      }
    }, 60_000);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [profile?.uid, profile?.status, profile?.privacy?.showOnlineStatus]);

  const clearAuthError = () => setAuthError(null);

  const signInWithGoogle = async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sign in failed.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Sign-in window was closed before completing authentication.');
      } else if (msg.includes('popup-blocked')) {
        setAuthError('Browser blocked the sign-in popup. Please allow popups for this site.');
      } else {
        setAuthError(msg);
      }
      return null;
    }
  };

  const registerProfile = async (
    payload: RegistrationPayload,
    explicitUser?: User | null
  ): Promise<void> => {
    setAuthError(null);
    const targetUser = explicitUser ?? firebaseUser;
    if (!targetUser) {
      throw new Error('Please authenticate with Google before completing registration.');
    }
    await createUserProfileRecord(targetUser, payload);
  };

  const updateProfile = async (updates: ProfileUpdatePayload): Promise<void> => {
    if (!firebaseUser || !profile) {
      throw new Error('No active user profile found.');
    }
    await updateOwnUserProfile(firebaseUser.uid, profile, updates);
  };

  const updateMedia = async (media: { avatarUrl?: string; coverUrl?: string }): Promise<void> => {
    if (!firebaseUser || !profile) {
      throw new Error('No active user profile found.');
    }
    await updateProfileMedia(firebaseUser.uid, media);
  };

  const updatePrivacy = async (privacy: PrivacySettings): Promise<void> => {
    if (!firebaseUser || !profile) {
      throw new Error('No active user profile found.');
    }
    await updatePrivacySettings(firebaseUser.uid, privacy);
  };

  const signOutUser = async (): Promise<void> => {
    setAuthError(null);
    if (profile?.uid && profile.status === 'approved') {
      await setUserOnlinePresence(profile.uid, false, false);
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        authReady,
        profileLoading,
        connectionOffline,
        authError,
        clearAuthError,
        signInWithGoogle,
        registerProfile,
        updateProfile,
        updateMedia,
        updatePrivacy,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
