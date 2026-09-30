// Somewhere for faults to go that is not console.error().
//
// WHY A PLAIN MODULE AND NOT A CONTEXT. The main consumer is
// DroneConnectionContext, which is flight-critical and already large. Adding a
// hook dependency there would mean another provider in the tree above it and a
// new way for a render to go wrong during a flight. A module-level sink is a
// plain function call from anywhere -- callbacks, promise chains, BLE handlers
// -- with no hook rules and no ordering to get wrong.
//
// WHY AT ALL. Faults were going to console.error(), which does two unhelpful
// things: it fires React Native's red dev overlay, which truncates the message
// to about forty characters and covers the controls, and it puts the text
// somewhere only a laptop attached to Metro can read. Neither survives a flight
// in a cave.
//
// ENTRIES NOW SURVIVE THE SESSION, when the operator asks them to.
//
// They used to be memory-only, on the reasoning that this only had to answer
// "what just went wrong" while the drone was still in the room. That turned out
// to be exactly wrong for the way this gets used: the interesting faults happen
// during a flight, the app is reopened afterwards to look at the recording, and
// by then the log was empty. A fault you cannot read tomorrow is not much of a
// record.
//
// So entries are written to storage, newest first, capped, and each one already
// carried the timestamp needed to make sense of it. Whether they are kept at
// all is the operator's choice -- see services/Prefs.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { describeDroneError } from './DroneErrors';
import { getPrefs } from './Prefs';

const LOG_KEY = 'cavebat.faultlog.v1';

export type LogLevel = 'error' | 'warn' | 'info';

export interface LogEntry {
  id: number;
  at: number;
  level: LogLevel;
  /** Which part of the app raised it: 'drone', 'flight', 'app'. */
  source: string;
  /** One line, already in plain language. */
  title: string;
  /** What it means and what to do, when known. */
  message?: string;
  fix?: string;
  /** The raw technical text, kept verbatim. */
  detail?: string;
}

// Enough to cover a flight and its aftermath without growing without bound.
const MAX_ENTRIES = 200;

let entries: LogEntry[] = [];
let nextId = 1;
let loaded = false;
const listeners = new Set<(entries: LogEntry[]) => void>();

// Writing on every entry would mean a storage round trip inside a BLE callback
// during a flight, and faults arrive in bursts -- one disconnect produces
// several. Coalescing them into one write keeps the log off the flight path.
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!getPrefs().keepErrors) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries)).catch(() => {
      // A fault log that cannot save itself is not worth raising a fault about.
    });
  }, 400);
}

/**
 * Reads the stored log once at startup. Call it after loadPrefs().
 *
 * Anything unreadable is discarded rather than repaired: a corrupt fault log is
 * not worth a migration, and starting empty is honest.
 */
export async function loadLog(): Promise<void> {
  if (loaded) return;
  loaded = true;
  if (!getPrefs().keepErrors) return;
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    entries = parsed.filter((e) => e && typeof e.at === 'number' && typeof e.title === 'string');
    nextId = entries.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0) + 1;
    emit();
  } catch {
    entries = [];
  }
}

/** Forgets what is stored without touching what is on screen. */
export async function forgetStoredLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LOG_KEY);
  } catch {
    // Nothing useful to do, and nothing depends on it having worked.
  }
}

function emit() {
  // A fresh array each time, or React sees the same reference and skips the
  // render.
  const snapshot = entries.slice();
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeToLog(fn: (entries: LogEntry[]) => void): () => void {
  listeners.add(fn);
  fn(entries.slice());
  return () => {
    listeners.delete(fn);
  };
}

export function getLogEntries(): LogEntry[] {
  return entries.slice();
}

export function clearLog(): void {
  entries = [];
  emit();
  // Storage as well, or the log the operator just cleared reappears at the next
  // launch, which reads as the button not having worked.
  void forgetStoredLog();
}

export function recordLog(entry: Omit<LogEntry, 'id' | 'at'>): void {
  // Newest first, because that is the one being read.
  entries = [{ ...entry, id: nextId++, at: Date.now() }, ...entries].slice(0, MAX_ENTRIES);
  emit();
  scheduleSave();
}

/**
 * Records a drone fault, translating it on the way in.
 *
 * The caller passes whatever the library gave it. describeDroneError turns that
 * into what happened, what it means and what to do, and the original is kept as
 * the detail.
 */
export function recordDroneError(raw: unknown, source = 'drone'): void {
  const text = raw instanceof Error ? raw.message : String(raw ?? '');
  const info = describeDroneError(text);
  recordLog({
    level: 'error',
    source,
    title: info.title,
    message: info.message,
    fix: info.fix,
    detail: text || undefined,
  });
}

/** Counts errors, for a badge on the nav. */
export function countErrors(list: LogEntry[]): number {
  return list.filter((e) => e.level === 'error').length;
}
