import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { api } from "./api";
import { getToken, setToken, hydrateToken } from "./storage";

interface AuthState {
  member: Member | null;
  loading: boolean;
  requestOtp: (identifier: string, displayName?: string, dateOfBirth?: string) => Promise<string | undefined>;
  verify: (identifier: string, code: string) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

async function requestOtp(identifier: string, displayName?: string, dateOfBirth?: string) {
  return (await api.requestOtp(identifier, displayName, dateOfBirth)).devCode;
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [member, setMember] = useState<Member | null>(null);
  // A persisted token might exist on native, so start in loading and resolve after
  // hydrating the secure store.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    hydrateToken().then(() => {
      if (!alive) return;
      if (!getToken()) { setLoading(false); return; }
      api.me()
        .then((m) => { if (alive) setMember(m); })
        .catch(() => setToken(null))
        .finally(() => { if (alive) setLoading(false); });
    });
    return () => { alive = false; };
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

  const value = useMemo(() => ({ member, loading, requestOtp, verify, signOut }), [member, loading, verify, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
