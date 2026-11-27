import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthResponse, AuthTokenResponsePassword } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResponse>;
  signIn: (email: string, password: string) => Promise<AuthTokenResponsePassword>;
  signOut: () => Promise<void>;
  /**
   * UI hint only. Real protection of admin data MUST come from Supabase
   * Row Level Security; this flag just decides what the UI shows.
   */
  isAdmin: boolean;
  /** True while the admin flag for the current user is being looked up. */
  adminLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

async function fetchIsAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking admin status:', error.message);
      return false;
    }
    return Boolean(data?.is_admin);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let request = 0;

    // The session is applied immediately (so a fresh sign-in is visible to the
    // router straight away); the admin flag is resolved separately and tracked
    // by `adminLoading`, so admin-only routes wait for it instead of redirecting.
    const applySession = (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      setSession(nextSession);
      setUser(nextUser);
      setLoading(false);

      const current = ++request;
      if (!nextUser) {
        setIsAdmin(false);
        setAdminLoading(false);
        return;
      }
      setAdminLoading(true);
      // Deferred: Supabase advises against awaiting other Supabase calls
      // directly inside the onAuthStateChange callback.
      setTimeout(() => {
        void fetchIsAdmin(nextUser.id).then((admin) => {
          if (!active || current !== request) return;
          setIsAdmin(admin);
          setAdminLoading(false);
        });
      }, 0);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) applySession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = (email: string, password: string, fullName: string) =>
    supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({
      email,
      password,
    });

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    isAdmin,
    adminLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
