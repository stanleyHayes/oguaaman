import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { api, getToken, setToken } from "./api";

export interface JoinInput {
  identifier: string;
  displayName: string;
  dateOfBirth: string;
  password: string;
  creatorTypes?: string[];
}

interface AuthState {
  member: Member | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<SignInResult>;
  completeMfa: (challenge: string, code: string) => Promise<void>;
  join: (input: JoinInput) => Promise<void>;
  signOut: () => void;
  setMember: (m: Member) => void;
}

/** What signIn resolves to: a session, or an MFA challenge to complete. */
export type SignInResult = { mfaRequired: boolean; challenge?: string };

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
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

  const signIn = useCallback(async (identifier: string, password: string): Promise<SignInResult> => {
    const res = await api.login(identifier, password);
    // MFA-enrolled account: hold the challenge; the caller collects the code
    // and finishes with completeMfa.
    if (res.mfaRequired && res.challenge) {
      return { mfaRequired: true, challenge: res.challenge };
    }
    if (res.token && res.member) {
      setToken(res.token);
      setMember(res.member);
      return { mfaRequired: false };
    }
    throw new Error("Sign in failed — unexpected response.");
  }, []);
  const completeMfa = useCallback(async (challenge: string, code: string) => {
    const { token, member } = await api.mfaLogin(challenge, code);
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

  const value = useMemo(() => ({ member, loading, signIn, completeMfa, join, signOut, setMember }), [member, loading, signIn, completeMfa, join, signOut]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
