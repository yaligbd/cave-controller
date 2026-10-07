// Who is signed in.
//
// The backend is injected rather than called directly, so moving from local
// accounts to the server means changing one line here -- see
// services/AuthStore.ts for why that seam exists.

import {
  Account,
  AuthBackend,
  loadSession,
  saveSession,
} from '@/services/AuthStore';
import { httpAuthBackend } from '@/services/CaveBatServer';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Accounts live on the Cave Bat server, shared with the website, so every
// uploaded flight belongs to the account that flew it. localAuthBackend (in
// AuthStore.ts) is still there for working without a server.
const backend: AuthBackend = httpAuthBackend;

interface AuthApi {
  account: Account | null;
  /** True until the stored session has been read. Screens must not redirect before this clears. */
  restoring: boolean;
  /** True while a sign-in or sign-up is in flight. */
  busy: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);

  // Restore the session before anything decides where to send the operator.
  // Redirecting on a not-yet-loaded session would bounce a signed-in user to
  // the sign-in screen on every cold start.
  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((stored) => {
        if (!cancelled) setAccount(stored);
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setBusy(true);
    try {
      const next = await backend.signIn(email, password);
      await saveSession(next);
      setAccount(next);
    } finally {
      // Cleared even on failure, or a rejected password would leave the form
      // spinning with no way to try again.
      setBusy(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    setBusy(true);
    try {
      const next = await backend.signUp(email, password, displayName);
      await saveSession(next);
      setAccount(next);
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await saveSession(null);
    setAccount(null);
  }, []);

  const api = useMemo<AuthApi>(
    () => ({ account, restoring, busy, signIn, signUp, signOut }),
    [account, restoring, busy, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
