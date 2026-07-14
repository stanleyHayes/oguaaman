import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { api } from "./api";
import { getToken, setToken, hydrateToken } from "./storage";

export interface JoinInput {
  identifier: string;
  displayName: string;
  dateOfBirth: string;
  password: string;
}

interface AuthState {
  member: Member | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  join: (input: JoinInput) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

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

  const signIn = useCallback(async (identifier: string, password: string) => {
    const { token, member } = await api.login(identifier, password);
    setToken(token);
    setMember(member);
  }, []);
  const join = useCallback(async (input: JoinInput) => {
    const { token, member } = await api.register(input);
    setToken(token);
    setMember(member);
  }, []);
  const signOut = useCallback(() => {
    setToken(null);
    setMember(null);
  }, []);

  const value = useMemo(() => ({ member, loading, signIn, join, signOut }), [member, loading, signIn, join, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
