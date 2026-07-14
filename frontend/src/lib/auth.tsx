import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { api, getToken, setToken } from "./api";

interface AuthState {
  member: Member | null;
  loading: boolean;
  /** Request an OTP; returns the dev code when the backend is in dev mode. */
  requestOtp: (identifier: string, displayName?: string, dateOfBirth?: string) => Promise<string | undefined>;
  verify: (identifier: string, code: string) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  // Only "loading" if there's a token to verify — initialised here so the effect
  // never has to setState synchronously (which would trigger a cascading render).
  const [loading, setLoading] = useState(() => getToken() != null);

  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then(setMember)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function requestOtp(identifier: string, displayName?: string, dateOfBirth?: string) {
    const r = await api.requestOtp(identifier, displayName, dateOfBirth);
    return r.devCode;
  }
  async function verify(identifier: string, code: string) {
    const { token, member } = await api.verifyOtp(identifier, code);
    setToken(token);
    setMember(member);
  }
  function signOut() {
    setToken(null);
    setMember(null);
  }

  return (
    <Ctx.Provider value={{ member, loading, requestOtp, verify, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
