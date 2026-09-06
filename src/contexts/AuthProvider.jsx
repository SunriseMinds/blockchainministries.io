import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/cloudflareApi';

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
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  /** Re-reads the current session — used on mount and after login/logout. */
  const loadSession = useCallback(async () => {
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
      console.error('Error loading session:', error);
      setSession(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Session lives in an HttpOnly cookie the Worker reads itself. Re-check
    // it on every mount (page load/refresh) — there is no push notification
    // for auth-state changes in this model, so each page that needs fresh
    // auth state re-fetches it directly.
    setLoading(true);
    loadSession();
  }, [loadSession]);

  const value = useMemo(() => ({
    user,
    profile,
    session,
    loading,
    /** Re-check the session (e.g. after a route that doesn't otherwise refresh it). */
    refreshSession: loadSession,
    /**
     * M9.8: passwordless. Requests a magic login link by email — no
     * password exists to check. The actual session is only established
     * later, by consumeLoginLink, once the user explicitly confirms via the
     * emailed link (never automatically on page load — see LoginVerify.jsx).
     */
    requestLoginLink: async (email) => {
      try {
        const data = await api.post('/auth/login-link/request', { email });
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    /** Exchanges a login-link token (from the emailed URL) for a session. */
    consumeLoginLink: async (token) => {
      try {
        const data = await api.post('/auth/login-link/consume', { token });
        setSession(data);
        setUser(toUser(data.user));
        setProfile(toProfile(data.user));
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    /**
     * `data` is the Worker's raw JSON body (`{ok, message, email_sent}`) —
     * email_sent is passed through unchanged so the caller can tell a
     * created-but-unverifiable account apart from a fully successful signup.
     * Accounts are passwordless (M9.8) — no password is ever sent.
     */
    signUp: async ({ email, options }) => {
      try {
        const data = await api.post('/auth/signup', {
          email,
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
        console.error('Error during logout:', error);
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
     * Token-based (the emailed link carries a one-time token), not an
     * authenticated "change my own password" call. `token` must be supplied
     * by the caller (see UpdatePassword.jsx, which reads it from the URL).
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
  }), [user, profile, session, loading, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
