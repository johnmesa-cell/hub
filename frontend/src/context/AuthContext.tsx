import { onAuthStateChanged, signOut, signInWithPopup, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { firebaseAuth, googleProvider } from '../firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      loginWithGoogle: async () => {
        try {
          await signInWithPopup(firebaseAuth, googleProvider);
        } catch (error) {
          console.error('Google login failed:', error);
          throw error;
        }
      },
      logout: async () => {
        try {
          await signOut(firebaseAuth);
        } catch (error) {
          console.error('Logout failed:', error);
          throw error;
        }
      },
      getToken: async () => {
        if (!user) return null;
        try {
          return await user.getIdToken();
        } catch (error) {
          console.error('Failed to get ID token:', error);
          return null;
        }
      }
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
