import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { api, USE_CLOUDFLARE_API } from '@/lib/cloudflareApi';
import { useToast } from '@/components/ui/use-toast';

export const AuthContext = createContext();

/** Cloudflare `/api/auth/session` user -> the shape existing pages already read off `user`. */
function toUser(u) {
  return { id: u.id, email: u.email, email_verified: u.email_verified };
}
/** Same session payload -> the shape existing pages already read off `profile`. */
function toProfile(u) {
  return { id: u.id, role: u.role, display_name: u.display_name };
}

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  }, []);

  /** Re-reads the current Cloudflare session — used on mount and after login/logout. */
  const loadCloudflareSession = useCallback(async () => {
    try {
      const data = await api.get('/auth/session');
      if (data.authenticated) {
        setSession(data);
        setUser(toUser(data.user));
        setProfile(toProfile(data.user));
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
    } catch (error) {
      console.error('Error loading Cloudflare session:', error);
      setSession(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (USE_CLOUDFLARE_API) {
      // Preview path: session lives in an HttpOnly cookie the Worker reads
      // itself. Re-check it on every mount (page load/refresh) — there is no
      // realtime auth-state push in this model, unlike Supabase's listener.
      setLoading(true);
      loadCloudflareSession();
      return;
    }

    setLoading(true);
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const userProfile = await fetchProfile(currentUser.id);
        setProfile(userProfile);
      }
      setLoading(false);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const userProfile = await fetchProfile(currentUser.id);
          setProfile(userProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile, loadCloudflareSession]);

  const cloudflareValue = useMemo(() => ({
    user,
    profile,
    session,
    loading,
    /** Re-check the session (e.g. after a route that doesn't otherwise refresh it). */
    refreshSession: loadCloudflareSession,
    signIn: async ({ email, password }) => {
      try {
        const data = await api.post('/auth/login', { email, password });
        setSession(data);
        setUser(toUser(data.user));
        setProfile(toProfile(data.user));
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    /** Mirrors the Supabase signUp({email,password,options:{data}}) call shape used by existing pages. */
    signUp: async ({ email, password, options }) => {
      try {
        const data = await api.post('/auth/signup', {
          email,
          password,
          display_name: options?.data?.display_name,
        });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    signOut: async () => {
      try {
        await api.post('/auth/logout');
      } catch (error) {
        console.error('Error during Cloudflare logout:', error);
      } finally {
        // Local auth state is cleared unconditionally, even if the server
        // call itself failed — a stuck "logged in" client state is worse
        // than a client that thinks it's logged out while a cookie lingers.
        setUser(null);
        setProfile(null);
        setSession(null);
      }
      return { error: null };
    },
    resetPasswordForEmail: async (email) => {
      try {
        const data = await api.post('/auth/request-password-reset', { email });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    /**
     * The Cloudflare reset flow is token-based (the emailed link carries a
     * one-time token), not an authenticated "change my own password" call —
     * unlike Supabase's recovery-session model. `token` must be supplied by
     * the caller (see UpdatePassword.jsx, which reads it from the URL).
     */
    updatePassword: async (newPassword, token) => {
      if (!token) {
        return { data: null, error: new Error('Missing or expired reset link. Please request a new one.') };
      }
      try {
        const data = await api.post('/auth/reset-password', { token, password: newPassword });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  }), [user, profile, session, loading, loadCloudflareSession]);

  const supabaseValue = useMemo(() => ({
    user,
    profile,
    session,
    loading,
    signIn: (data) => supabase.auth.signInWithPassword(data),
    signUp: (data) => supabase.auth.signUp(data),
    signOut: () => supabase.auth.signOut(),
    resetPasswordForEmail: (email) => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    }),
    updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
  }), [user, profile, session, loading]);

  const value = USE_CLOUDFLARE_API ? cloudflareValue : supabaseValue;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
