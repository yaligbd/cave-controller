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
// Entries are kept in memory only. A fault log that outlives the session would
// need pruning, migration and a storage format; this needs to answer "what just
// went wrong" while the drone is still in the room.

import { describeDroneError } from './DroneErrors';

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
const listeners = new Set<(entries: LogEntry[]) => void>();

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
}

export function recordLog(entry: Omit<LogEntry, 'id' | 'at'>): void {
  // Newest first, because that is the one being read.
  entries = [{ ...entry, id: nextId++, at: Date.now() }, ...entries].slice(0, MAX_ENTRIES);
  emit();
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
