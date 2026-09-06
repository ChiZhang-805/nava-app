import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";
import { AuthContext } from "./authContext";
import {
  ensureProfile,
  isEmail,
  otpLengthForAccount,
  sendLoginOtp as sendLoginOtpRemote,
  sendPasswordResetOtp as sendPasswordResetOtpRemote,
  sendRegistrationOtp as sendRegistrationOtpRemote,
  signInWithPassword,
  updateCurrentPassword as updateCurrentPasswordRemote,
  verifyLoginOtp as verifyLoginOtpRemote,
  verifyPasswordResetOtp as verifyPasswordResetOtpRemote,
  verifyRegistrationOtp as verifyRegistrationOtpRemote,
} from "../services/auth";
import {
  clearDemoAuthSession,
  demoUser,
  hasDemoAuthSession,
  isDemoLoginCredential,
  isDemoMode,
  isDemoOtpCode,
  startDemoAuthSession,
} from "../services/demo";
import { deactivateRemotePush } from "../services/remotePush";

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

    void supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!alive) return;
        if (sessionError) {
          setError(sessionError.message);
          setUser(null);
          setLoading(false);
          return;
        }
        setUser(data.session?.user ?? null);
        setLoading(false);
        if (data.session?.user) {
          ensureProfile(data.session.user.id, data.session.user.email).catch(() => undefined);
        }
      })
      .catch((sessionError: unknown) => {
        if (!alive) return;
        setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
        setUser(null);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
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
        if (!isDemoLoginCredential(email, password)) throw new Error("账号或密码不正确。");
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
    if (user) await deactivateRemotePush(user.id).catch((pushError) => console.warn("Remote push deactivation deferred", pushError));
    const { error: authError } = await supabase.auth.signOut();
    if (authError) {
      const { error: localError } = await supabase.auth.signOut({ scope: "local" });
      if (localError) {
        setError(localError.message);
        throw localError;
      }
      setUser(null);
      setPasswordRecovery(false);
    }
  }, [user]);

  const activateDemoSession = useCallback(() => {
    startDemoAuthSession();
    setUser(demoUser);
  }, []);

  const requireDemoOtp = useCallback((account: string, code: string) => {
    const expectedLength = otpLengthForAccount(account);
    if (!isDemoOtpCode(code, expectedLength)) {
      throw new Error(expectedLength === 8 ? "请输入 8 位邮箱验证码。" : "请输入 6 位短信验证码。");
    }
  }, []);

  const sendLoginOtp = useCallback(async (account: string) => {
    if (isDemoMode()) return isEmail(account) ? "email" as const : "sms" as const;
    return sendLoginOtpRemote(account);
  }, []);

  const verifyLoginOtp = useCallback(async (account: string, code: string) => {
    if (isDemoMode()) {
      requireDemoOtp(account, code);
      activateDemoSession();
      return;
    }
    await verifyLoginOtpRemote(account, code);
  }, [activateDemoSession, requireDemoOtp]);

  const sendRegistrationOtp = useCallback(async (account: string) => {
    if (isDemoMode()) return isEmail(account) ? "email" as const : "sms" as const;
    return sendRegistrationOtpRemote(account);
  }, []);

  const verifyRegistrationOtp = useCallback(async (account: string, code: string, password: string) => {
    if (isDemoMode()) {
      requireDemoOtp(account, code);
      if (password.length < 6) throw new Error("密码至少需要 6 位。");
      activateDemoSession();
      return;
    }
    await verifyRegistrationOtpRemote(account, code, password);
  }, [activateDemoSession, requireDemoOtp]);

  const sendPasswordResetOtp = useCallback(async (account: string) => {
    if (isDemoMode()) return isEmail(account) ? "email" as const : "sms" as const;
    return sendPasswordResetOtpRemote(account);
  }, []);

  const verifyPasswordResetOtp = useCallback(async (account: string, code: string, password: string) => {
    if (isDemoMode()) {
      requireDemoOtp(account, code);
      if (password.length < 6) throw new Error("密码至少需要 6 位。");
      return;
    }
    await verifyPasswordResetOtpRemote(account, code, password);
  }, [requireDemoOtp]);

  const updateCurrentPassword = useCallback(async (password: string, requireDifferent = false) => {
    if (isDemoMode()) {
      if (password.length < 6) throw new Error("密码至少需要 6 位。");
      return;
    }
    await updateCurrentPasswordRemote(password, requireDifferent);
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
  }, [updateCurrentPassword]);

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
    [
      error,
      finishPasswordRecovery,
      loading,
      passwordRecovery,
      sendLoginOtp,
      sendPasswordResetOtp,
      sendRegistrationOtp,
      signIn,
      signOut,
      updateCurrentPassword,
      user,
      verifyLoginOtp,
      verifyPasswordResetOtp,
      verifyRegistrationOtp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
