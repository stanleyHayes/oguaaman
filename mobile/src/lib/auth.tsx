import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Member } from "./types";
import { api, clientPlatform, errorStatus, TERMS_VERSION } from "./api";
import { getToken, setToken, hydrateToken } from "./storage";

export interface JoinInput {
  identifier: string;
  displayName: string;
  dateOfBirth: string;
  password: string;
  /** Optional creator kinds ("writer", …) chosen at sign-up. */
  creatorTypes?: string[];
  /** Creator plan preference (free plans only in the app). */
  creatorPlanIntent?: string;
  /** The member ticked "I agree to the Terms of Use and Privacy Policy" (K1). */
  acceptTerms: boolean;
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

// Back-off between session-restore attempts after a non-auth failure at launch.
const SESSION_RETRY_DELAYS_MS = [3_000, 10_000, 30_000];

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [member, setMember] = useState<Member | null>(null);
  // A persisted token might exist on native, so start in loading and resolve after
  // hydrating the secure store.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Restore the session. Only a 401 means the stored token is dead (expired,
    // revoked or signed out elsewhere); offline launches and server hiccups keep
    // it and quietly retry, so a flaky connection never signs the member out.
    const restore = (attempt: number) => {
      api.me()
        .then((m) => { if (alive) setMember(m); })
        .catch((e: unknown) => {
          if (errorStatus(e) === 401) { setToken(null); return; }
          if (alive && attempt < SESSION_RETRY_DELAYS_MS.length) {
            retry = setTimeout(() => restore(attempt + 1), SESSION_RETRY_DELAYS_MS[attempt]);
          }
        })
        .finally(() => { if (alive) setLoading(false); });
    };
    hydrateToken().then(() => {
      if (!alive) return;
      if (!getToken()) { setLoading(false); return; }
      restore(0);
    });
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
    };
  }, []);

  const signIn = useCallback(async (identifier: string, password: string): Promise<SignInResult> => {
    const res = await api.login(identifier, password);
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
    const { token, member } = await api.register({ ...input, termsVersion: TERMS_VERSION, platform: clientPlatform() });
    setToken(token);
    setMember(member);
  }, []);
  const signOut = useCallback(() => {
    setToken(null);
    setMember(null);
  }, []);

  const value = useMemo(() => ({ member, loading, signIn, completeMfa, join, signOut, setMember }), [member, loading, signIn, completeMfa, join, signOut, setMember]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
