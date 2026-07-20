import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";
import { AuthContext } from "./authContext";
import {
  ensureProfile,
  sendLoginOtp,
  sendPasswordResetOtp,
  sendRegistrationOtp,
  signInWithPassword,
  updateCurrentPassword,
  verifyLoginOtp,
  verifyPasswordResetOtp,
  verifyRegistrationOtp,
} from "../services/auth";
import { clearDemoAuthSession, demoUser, hasDemoAuthSession, isDemoLoginCredential, isDemoMode, startDemoAuthSession } from "../services/demo";

function recoveryFlowInUrl() {
  if (typeof window === "undefined") return false;
  const queryFlow = new URLSearchParams(window.location.search).get("auth");
  const hashFlow = new URLSearchParams(window.location.hash.slice(1)).get("type");
  return queryFlow === "recovery" || hashFlow === "recovery";
}

function clearAuthFlowFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("auth");
  url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(recoveryFlowInUrl);

  useEffect(() => {
    let alive = true;

    if (isDemoMode() && hasDemoAuthSession()) {
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

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "SIGNED_OUT") setPasswordRecovery(false);
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
      if (isDemoMode()) {
        if (!isDemoLoginCredential(email, password)) throw new Error("演示账号或密码不正确。");
        startDemoAuthSession();
        setUser(demoUser);
        return;
      }
      await signInWithPassword(email, password);
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : String(authError);
      setError(message);
      throw authError;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    if (isDemoMode()) {
      clearDemoAuthSession();
      setUser(null);
      setPasswordRecovery(false);
      return;
    }
    const { error: authError } = await supabase.auth.signOut();
    if (authError) {
      setError(authError.message);
      throw authError;
    }
  }, []);

  const finishPasswordRecovery = useCallback(async (password: string) => {
    setError(null);
    try {
      await updateCurrentPassword(password, true);
      setPasswordRecovery(false);
      clearAuthFlowFromUrl();
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : String(authError);
      setError(message);
      throw authError;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      passwordRecovery,
      signIn,
      signOut,
      finishPasswordRecovery,
      clearError: () => setError(null),
      sendLoginOtp,
      verifyLoginOtp,
      sendRegistrationOtp,
      verifyRegistrationOtp,
      sendPasswordResetOtp,
      verifyPasswordResetOtp,
      updateCurrentPassword,
    }),
    [error, finishPasswordRecovery, loading, passwordRecovery, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
