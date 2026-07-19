import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  finishPasswordRecovery: (password: string) => Promise<void>;
  clearError: () => void;
  sendRegistrationOtp: (account: string) => Promise<"email" | "sms">;
  verifyRegistrationOtp: (account: string, code: string, password: string) => Promise<void>;
  sendPasswordResetOtp: (account: string) => Promise<"email" | "sms">;
  verifyPasswordResetOtp: (account: string, code: string, password: string) => Promise<void>;
  updateCurrentPassword: (password: string, requireDifferent?: boolean) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
