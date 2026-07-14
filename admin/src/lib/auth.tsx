import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { api, getToken, setToken } from "./api";

interface AuthState {
  member: Member | null;
  loading: boolean;
  requestOtp: (identifier: string) => Promise<string | undefined>;
  verify: (identifier: string, code: string) => Promise<void>;
  signOut: () => void;
  /** Update the cached member (e.g. after editing your profile). */
  setMember: (m: Member) => void;
}

const Ctx = createContext<AuthState | null>(null);

async function requestOtp(identifier: string) {
  return (await api.requestOtp(identifier)).devCode;
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [member, setMember] = useState<Member | null>(null);
  // Only "loading" if there's a token to verify — initialised here so the effect
  // never has to setState synchronously (which would trigger a cascading render).
  const [loading, setLoading] = useState(() => getToken() != null);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setMember).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const verify = useCallback(async (identifier: string, code: string) => {
    const { token, member } = await api.verifyOtp(identifier, code);
    setToken(token);
    setMember(member);
  }, []);
  const signOut = useCallback(() => {
    setToken(null);
    setMember(null);
  }, []);

  const value = useMemo(() => ({ member, loading, requestOtp, verify, signOut, setMember }), [member, loading, verify, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
