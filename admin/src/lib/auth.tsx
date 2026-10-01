import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { EVT_MFA_REQUIRED, EVT_SESSION_EXPIRED, api, getToken, setToken } from "./api";

interface AuthState {
  member: Member | null;
  loading: boolean;
  /** Bumped on every sign-in and sign-out, so per-session state (the router
   *  and its cached loader data) is rebuilt instead of leaking across users. */
  session: number;
  /** The API refused a staff route with 403 mfa_required (K4): the console
   *  must route the staffer to two-factor enrolment. */
  mfaRequired: boolean;
  signIn: (identifier: string, password: string) => Promise<SignInResult>;
  completeMfa: (challenge: string, code: string) => Promise<void>;
  signOut: () => void;
  /** Update the cached member (e.g. after editing your profile). */
  setMember: (m: Member) => void;
}

/** What signIn resolves to: a session, or an MFA challenge to complete. */
export type SignInResult = { mfaRequired: boolean; challenge?: string };

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [member, setMemberState] = useState<Member | null>(null);
  // Only "loading" if there's a token to verify — initialised here so the effect
  // never has to setState synchronously (which would trigger a cascading render).
  const [loading, setLoading] = useState(() => getToken() != null);
  const [session, setSession] = useState(0);
  const [mfaRequired, setMfaRequired] = useState(false);

  const startSession = useCallback((token: string, m: Member) => {
    setToken(token);
    setMemberState(m);
    setMfaRequired(false);
    setSession((s) => s + 1);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setMemberState(null);
    setMfaRequired(false);
    setSession((s) => s + 1);
  }, []);

  const setMember = useCallback((m: Member) => {
    setMemberState(m);
    // A fresh self view with two-factor on clears the enrolment prompt.
    if (m.mfaEnabled && !m.staffMfaRequired) setMfaRequired(false);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setMemberState).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  // Session-wide API conditions: a revoked token (401) signs the console out;
  // a staff route answering mfa_required routes the staffer to enrolment.
  useEffect(() => {
    const onExpired = () => signOut();
    const onMfa = () => {
      setMfaRequired(true);
      // Refresh the self view so the enrolment screen matches the server.
      api.me().then(setMember).catch(() => undefined);
    };
    window.addEventListener(EVT_SESSION_EXPIRED, onExpired);
    window.addEventListener(EVT_MFA_REQUIRED, onMfa);
    return () => {
      window.removeEventListener(EVT_SESSION_EXPIRED, onExpired);
      window.removeEventListener(EVT_MFA_REQUIRED, onMfa);
    };
  }, [signOut, setMember]);

  const signIn = useCallback(async (identifier: string, password: string): Promise<SignInResult> => {
    const res = await api.login(identifier, password);
    if (res.mfaRequired && res.challenge) {
      return { mfaRequired: true, challenge: res.challenge };
    }
    if (res.token && res.member) {
      startSession(res.token, res.member);
      return { mfaRequired: false };
    }
    throw new Error("Sign in failed — unexpected response.");
  }, [startSession]);
  const completeMfa = useCallback(async (challenge: string, code: string) => {
    const { token, member } = await api.mfaLogin(challenge, code);
    startSession(token, member);
  }, [startSession]);

  const value = useMemo(
    () => ({ member, loading, session, mfaRequired, signIn, completeMfa, signOut, setMember }),
    [member, loading, session, mfaRequired, signIn, completeMfa, signOut, setMember],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
