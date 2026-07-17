import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";
import { AuthContext } from "./authContext";
import {
  ensureProfile,
  resetPassword,
  signInWithPassword,
  signUpWithPassword,
  verifyEmailOtp,
  verifySmsOtp,
  sendEmailOtp,
  sendSmsOtp,
  updateCurrentPassword,
} from "../services/auth";
import { demoUser, isDemoMode } from "../services/demo";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    if (isDemoMode()) {
      setUser(demoUser);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        ensureProfile(data.session.user.id, data.session.user.email).catch(() => undefined);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        ensureProfile(session.user.id, session.user.email).catch(() => undefined);
      }
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : String(authError);
      setError(message);
      throw authError;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signUpWithPassword(email, password);
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : String(authError);
      setError(message);
      throw authError;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    const { error: authError } = await supabase.auth.signOut();
    if (authError) {
      setError(authError.message);
      throw authError;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      clearError: () => setError(null),
      sendEmailOtp,
      verifyEmailOtp,
      sendSmsOtp,
      verifySmsOtp,
      resetPassword,
      updateCurrentPassword,
    }),
    [error, loading, signIn, signOut, signUp, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
