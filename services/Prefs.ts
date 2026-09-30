// What the app keeps between sessions, and what it throws away.
//
// WHY THIS IS A CHOICE AND NOT A DEFAULT. Flights and faults are the only
// record of what happened in a room the operator was not able to watch closely.
// Keeping them is usually right. But this runs on a phone, a flight is a few
// hundred samples, and a long day of testing is dozens of flights -- so the
// person doing the testing gets to decide, rather than discovering months later
// that the app has quietly filled up.
//
// Turning a switch OFF stops new records being written. It does not delete what
// is already there: that is a separate, explicit button, because losing a
// morning's flights to a mis-tapped toggle would be unforgivable.

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = 'cavebat.prefs.v1';

export interface Prefs {
  /** Keep downloaded flights on the phone between sessions. */
  keepFlights: boolean;
  /** Keep the fault log between sessions. */
  keepErrors: boolean;
}

const DEFAULTS: Prefs = { keepFlights: true, keepErrors: true };

let current: Prefs = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<(p: Prefs) => void>();

function emit() {
  const snapshot = { ...current };
  listeners.forEach((fn) => fn(snapshot));
}

export function getPrefs(): Prefs {
  return { ...current };
}

/**
 * Reads the stored preferences once at startup.
 *
 * Safe to call more than once; later calls are ignored. If storage is
 * unreadable the defaults stand, because a preferences failure must never stop
 * the app loading.
 */
export async function loadPrefs(): Promise<Prefs> {
  if (loaded) return getPrefs();
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      current = {
        keepFlights: typeof parsed?.keepFlights === 'boolean' ? parsed.keepFlights : DEFAULTS.keepFlights,
        keepErrors: typeof parsed?.keepErrors === 'boolean' ? parsed.keepErrors : DEFAULTS.keepErrors,
      };
    }
  } catch {
    current = { ...DEFAULTS };
  }
  emit();
  return getPrefs();
}

export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  current = { ...current, [key]: value };
  emit();
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(current));
  } catch {
    // The switch still moved for this session. Not worth an error dialog.
  }
}

export function subscribeToPrefs(fn: (p: Prefs) => void): () => void {
  listeners.add(fn);
  fn(getPrefs());
  return () => {
    listeners.delete(fn);
  };
}
