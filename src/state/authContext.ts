import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  finishPasswordRecovery: (password: string) => Promise<void>;
  clearError: () => void;
  sendSmsOtp: (phone: string) => Promise<void>;
  verifySmsOtp: (phone: string, code: string, mode: "login" | "register", password?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateCurrentPassword: (password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
