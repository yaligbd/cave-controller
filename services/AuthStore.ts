// Accounts and sessions.
//
// READ THIS BEFORE TRUSTING IT WITH ANYTHING.
//
// These are LOCAL accounts, held on this phone. They exist so the sign-in and
// sign-up screens are real and usable before the server is built -- not to
// protect anything. A local account cannot: verify an email address, stop
// someone reinstalling the app, or keep a determined person out of files that
// are already on their own device.
//
// Real authentication belongs on the server, which is why everything below sits
// behind the AuthBackend interface. When the server exists, write an
// HttpAuthBackend that posts to it, swap which backend AuthContext constructs,
// and the screens do not change at all. The password stops being hashed here
// and starts being hashed there, with bcrypt or argon2, which is where it
// belongs.
//
// What this DOES do is avoid teaching the project a bad habit: no password is
// ever written to storage in readable form.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256Hex } from './Sha256';

const ACCOUNTS_KEY = 'cavebat.accounts.v1';
const SESSION_KEY = 'cavebat.session.v1';

// Rounds of hashing applied to a password before storage.
//
// One round of SHA-256 is far too fast for a password -- that is the whole
// reason bcrypt and argon2 exist. Repeating it is a crude stand-in that makes
// guessing thousands of times more expensive than a single round, while staying
// fast enough that signing in on a phone feels instant. It is a speed bump, not
// a key derivation function, and it is not what the server should do.
const HASH_ROUNDS = 2000;

export interface Account {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
}

/** What is persisted. The password itself never is. */
interface StoredAccount extends Account {
  salt: string;
  hash: string;
}

export class AuthError extends Error {
  /** A short code so the UI can decide which field to point at. */
  code: 'email-taken' | 'no-such-account' | 'wrong-password' | 'invalid-email' | 'weak-password' | 'storage';
  constructor(code: AuthError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export interface AuthBackend {
  signUp(email: string, password: string, displayName: string): Promise<Account>;
  signIn(email: string, password: string): Promise<Account>;
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately permissive. Rejecting unusual but valid addresses is worse than accepting a typo. */
export function isPlausibleEmail(email: string): boolean {
  const e = normaliseEmail(email);
  return e.length >= 5 && e.includes('@') && !e.startsWith('@') && !e.endsWith('@') && !/\s/.test(e);
}

export const MIN_PASSWORD_LENGTH = 8;

function makeSalt(): string {
  // Uniqueness is what a salt needs -- it stops two people with the same
  // password sharing a hash. It does not need to be unpredictable, which is
  // just as well, because there is no cryptographic random source here without
  // a native module.
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }
  return s + Date.now().toString(16);
}

function derive(password: string, salt: string): string {
  let h = sha256Hex(salt + password);
  for (let i = 1; i < HASH_ROUNDS; i++) h = sha256Hex(h + salt);
  return h;
}

/**
 * Constant-time-ish comparison.
 *
 * Both hashes are the same length here, so this mostly guards habit rather than
 * a real timing channel -- but comparing secrets with === is a pattern worth
 * not copying elsewhere.
 */
function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Unreadable storage is treated as empty rather than fatal. The screens
    // still work, and a fresh sign-up recovers.
    return [];
  }
}

async function writeAccounts(accounts: StoredAccount[]): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function publicPart(account: StoredAccount): Account {
  const { salt, hash, ...rest } = account;
  return rest;
}

export const localAuthBackend: AuthBackend = {
  async signUp(email, password, displayName) {
    const normalised = normaliseEmail(email);
    if (!isPlausibleEmail(normalised)) {
      throw new AuthError('invalid-email', 'That does not look like an email address.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(
        'weak-password',
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      );
    }

    const accounts = await readAccounts();
    if (accounts.some((a) => a.email === normalised)) {
      throw new AuthError('email-taken', 'An account already uses that email on this device.');
    }

    const salt = makeSalt();
    const account: StoredAccount = {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      email: normalised,
      displayName: displayName.trim() || normalised.split('@')[0],
      createdAt: Date.now(),
      salt,
      hash: derive(password, salt),
    };

    await writeAccounts([...accounts, account]);
    return publicPart(account);
  },

  async signIn(email, password) {
    const normalised = normaliseEmail(email);
    const accounts = await readAccounts();
    const found = accounts.find((a) => a.email === normalised);
    if (!found) {
      throw new AuthError('no-such-account', 'No account on this device uses that email.');
    }
    if (!hashesMatch(derive(password, found.salt), found.hash)) {
      throw new AuthError('wrong-password', 'That password does not match.');
    }
    return publicPart(found);
  },
};

// --- Session -----------------------------------------------------------------
// Which account is signed in, so the app does not ask again on every launch.

export async function loadSession(): Promise<Account | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

export async function saveSession(account: Account | null): Promise<void> {
  if (account) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(account));
  else await AsyncStorage.removeItem(SESSION_KEY);
}

/** Every local account, for the settings screen. Never includes hashes. */
export async function listAccounts(): Promise<Account[]> {
  return (await readAccounts()).map(publicPart);
}
