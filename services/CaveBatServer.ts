// ===========================================================================
//  SAFE TO CHANGE WITHOUT THE DRONE.
// ===========================================================================
//
// Everything in the app that talks to the Cave Bat server, in one place:
//
//   httpAuthBackend  accounts on the server instead of only on this phone, so
//                    the same email and password work in the app and on the
//                    website. Plugs into the AuthBackend seam AuthStore.ts was
//                    built around; AuthContext.tsx picks it.
//
//   uploadFlight     copies a saved flight to the signed-in account on the
//                    server, where the website can replay it in 3D at any
//                    time. FlightStore.saveFlight() calls it.
//
// Signing in or up needs the network. After that the session is kept on the
// phone as before: the app opens signed in and flies with no network at all.
// Uploads fail soft -- they never throw and never delay the save to the phone,
// and a flight that did not go up is still on the phone for uploadFlights().
//
// The server address comes from .env.local at the root of the app (restart
// Metro after changing it; it is compiled in):
//
//   EXPO_PUBLIC_CAVEBAT_API_URL=https://your-service.onrender.com
// ===========================================================================

import type { Flight } from '@/types/flightT';
import { Account, AuthBackend, AuthError, loadSession } from './AuthStore';

const API_URL = (process.env.EXPO_PUBLIC_CAVEBAT_API_URL ?? '').replace(/\/+$/, '');

// Long on purpose. A free Render service sleeps when idle and takes up to a
// minute to wake; the first request after a quiet spell is the one that
// wakes it, and failing that one would look like the server is down.
const TIMEOUT_MS = 70_000;

/** A signed-in account plus the server's token. Saved as the session, token included. */
export interface ServerAccount extends Account {
  token: string;
}

interface ServerUser {
  id: string;
  email: string;
  displayName?: string;
  createdAt?: string;
}

/** fetch with a timeout. Throws a readable Error if the server cannot be reached. */
async function call(path: string, init: RequestInit): Promise<{ status: number; body: any }> {
  if (!API_URL) {
    throw new Error(
      'No server is configured. Set EXPO_PUBLIC_CAVEBAT_API_URL in .env.local and restart Metro.'
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    throw new Error(`Cannot reach the Cave Bat server at ${API_URL}. Check the phone has internet.`);
  } finally {
    clearTimeout(timer);
  }
}

// --- Accounts ----------------------------------------------------------------

function toAccount(user: ServerUser, token: string): ServerAccount {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.email.split('@')[0],
    createdAt: Date.parse(user.createdAt ?? '') || Date.now(),
    token,
  };
}

/**
 * Turns a refused sign-in or sign-up into the AuthError codes AuthPanel already
 * understands, so it points at the right field. Anything else is a plain Error,
 * which AuthPanel shows in a dialog.
 */
function refusal(status: number, body: any): Error {
  const message: string = body?.error ?? `The server answered ${status}.`;
  const fields: { field: string; message: string }[] = body?.details ?? [];
  if (status === 409) return new AuthError('email-taken', 'An account already uses that email.');
  if (status === 401) return new AuthError('wrong-password', 'Incorrect email or password.');
  if (status === 400) {
    const email = fields.find((d) => d.field === 'email');
    if (email) return new AuthError('invalid-email', email.message);
    const password = fields.find((d) => d.field === 'password');
    if (password) return new AuthError('weak-password', password.message);
  }
  return new Error(message);
}

async function authenticate(path: string, payload: object): Promise<Account> {
  const { status, body } = await call(path, { method: 'POST', body: JSON.stringify(payload) });
  if (status !== 200 && status !== 201) throw refusal(status, body);
  // Returned as Account, kept as ServerAccount: AuthContext saves the whole
  // object as the session, so the token is saved with it.
  const account: ServerAccount = toAccount(body.user, body.token);
  return account;
}

export const httpAuthBackend: AuthBackend = {
  signUp: (email, password, displayName) =>
    authenticate('/api/auth/register', {
      email,
      password,
      displayName: displayName.trim() || undefined,
    }),
  signIn: (email, password) => authenticate('/api/auth/login', { email, password }),
};

/** The signed-in account's token, or null if signed out or signed in before accounts moved to the server. */
async function currentToken(): Promise<string | null> {
  const session = (await loadSession()) as Partial<ServerAccount> | null;
  return session?.token ?? null;
}

// --- Flights -----------------------------------------------------------------

type UploadableFlight = Flight & { savedAt?: number };

/** One sample as the API takes it: metres, degrees, seconds. */
interface ApiSample {
  t: number;
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
  tilt?: number;
  front?: number;
  back?: number;
  left?: number;
  right?: number;
  up?: number;
  down?: number;
  wfState?: number;
  wfMode?: number;
}

/** The fields this file reads from the drone's raw sample, where the flight kept them. */
interface RawExtras {
  tiltDeg?: number;
  wfState?: number;
  wfMode?: number;
}

function at(series: number[] | undefined, i: number): number | undefined {
  const v = series?.[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * The flight in the API's shape, or null if there is nothing honest to send.
 *
 * Reads flightPath, which buildFlight() has already put in metres. A flight
 * without posX/Y/Z has no recorded position, and inventing one is exactly
 * what this app stopped doing -- so such a flight is not uploaded at all.
 */
function toPayload(flight: UploadableFlight) {
  const fp = flight.flightPath;
  if (!fp?.time?.length || !fp.posX || !fp.posY || !fp.posZ) return null;

  // The raw samples line up one-to-one with flightPath (buildFlight and the
  // posX backfill in listFlights both map them in order). They carry what
  // flightPath leaves out or fills in: the follower's step and mode, and
  // whether tilt was measured at all -- flightPath stores 0 where it wasn't.
  const raw = (flight as { samples?: RawExtras[] }).samples;

  const samples: ApiSample[] = [];
  for (let i = 0; i < fp.time.length; i++) {
    const x = at(fp.posX, i);
    const y = at(fp.posY, i);
    const z = at(fp.posZ, i);
    if (x === undefined || y === undefined || z === undefined) continue;
    const r = raw?.[i];
    samples.push({
      t: at(fp.time, i) ?? i,
      x,
      y,
      z,
      roll: at(fp.roll, i) ?? 0,
      pitch: at(fp.pitch, i) ?? 0,
      yaw: at(fp.yaw, i) ?? 0,
      tilt: r ? r.tiltDeg : at(fp.tilt, i),
      // 0 means the laser saw nothing; the server stores it as "no reading".
      front: at(fp.frontSensor, i),
      back: at(fp.backSensor, i),
      left: at(fp.leftSensor, i),
      right: at(fp.rightSensor, i),
      up: at(fp.TopSensor, i),
      down: at(fp.downSensor, i),
      wfState: r?.wfState,
      wfMode: r?.wfMode,
    });
  }
  if (!samples.length) return null;

  return {
    clientId: String(flight.id),
    name: flight.name,
    source: flight.name.startsWith('Live (phone)') ? 'phone' : 'drone',
    recordedAt: new Date(flight.savedAt ?? flight.id).toISOString(),
    samples,
  };
}

/** Sends one flight to the signed-in account. Resolves true if the server has it. Never rejects. */
export async function uploadFlight(flight: UploadableFlight): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const token = await currentToken();
    if (!token) {
      console.warn(
        `[server] not uploading "${flight.name}": not signed in to a server account. ` +
          'Sign out and sign in again. The flight is still saved on the phone.'
      );
      return false;
    }
    const payload = toPayload(flight);
    if (!payload) {
      console.warn(`[server] not uploading "${flight.name}": it has no recorded position`);
      return false;
    }

    const { status, body } = await call('/api/flights', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (status === 401) {
      console.warn(`[server] upload of "${flight.name}" refused: the sign-in has expired. Sign in again.`);
      return false;
    }
    if (status !== 200 && status !== 201) {
      console.warn(`[server] upload of "${flight.name}" refused: ${status} ${JSON.stringify(body).slice(0, 300)}`);
      return false;
    }
    console.log(`[server] uploaded "${flight.name}" (${payload.samples.length} samples)`);
    return true;
  } catch (e) {
    console.warn(`[server] upload of "${flight.name}" failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Sends several flights, one at a time, and returns how many the server has.
 * For flights saved before uploading was switched on, or while offline:
 *
 *   await uploadFlights(await listFlights());
 *
 * Safe to repeat: the server recognises a flight it already has.
 */
export async function uploadFlights(flights: UploadableFlight[]): Promise<number> {
  let sent = 0;
  for (const f of flights) {
    if (await uploadFlight(f)) sent++;
  }
  return sent;
}
