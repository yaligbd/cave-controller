// ===========================================================================
//  FLIGHT-CRITICAL FILE.  A STALE CACHE HERE MAKES THE DRONE IGNORE THE APP.
// ===========================================================================
//
// This caches the drone's parameter and log catalogues -- the mapping from a
// name like "mission.state" to the numeric ID the firmware actually answers to.
// If that mapping is wrong, commands go to the wrong parameter or nowhere, and
// nothing reports an error.
//
// The drone cannot be tested against right now. Assume any change here is
// unverifiable until it is back.
//
// THE ONE RULE
//
//   BUMP CACHE_FORMAT_VERSION WHENEVER THE NAME REPAIR TABLES IN
//   CrtpService.ts CHANGE.
//
// The cache is keyed on (kind, count, crc) -- all properties of the DRONE.
// None of them change when the APP's repair table changes. So after fixing a
// corrupted name in CrtpService, the cache written before the fix still holds
// the broken version, and the app reloads it forever.
//
// That is not hypothetical. mission.wallfollow was cached corrupted, and after
// the repair table was fixed the app still could not see the parameter, still
// insisted the firmware could not wall follow, and the only thing that cleared
// it was bumping this number. It is one line and it costs one slow reconnect.
//
// WHY THE CACHE EXISTS AT ALL
//
// Walking the catalogue takes 335 round trips for parameters and 544 for log
// variables, at roughly a second each over BLE. Connection time went from four
// or five minutes to seconds when this was added. Removing it would make the
// app feel broken.
//
// EXPECT ONE SLOW CONNECTION after any firmware flash that adds or removes a
// parameter, or after bumping the version here. That is the cache doing its
// job, not a fault. Tell the user to wait rather than pressing scan again --
// restarting throws away the progress and begins the whole walk over.
// ===========================================================================

// Disk cache for the drone's parameter and log catalogues (its "TOCs").
//
// Why this exists
// ---------------
// To talk to the drone the app needs the ID number behind each variable name.
// The only way to learn them over CRTP is to walk the catalogue one entry at a
// time, and this firmware publishes ~312 parameters and ~370 log variables.
// Over BLE that is one round trip each, and it was measured at 4-5 MINUTES per
// connection. The app then threw the result away and did it again next time.
//
// The catalogues only change when the firmware changes, and the drone hands
// out a CRC of each one up front. So: fetch once, save it, and on every later
// connection compare the CRC. Match means reuse and connect in seconds.
//
// This is the same trick cflib uses (its `rw_cache`), which is why a Python
// script connects to this drone in about two seconds while the app took
// minutes against the identical hardware.

import * as FileSystem from 'expo-file-system/legacy';
import type { LogEntry, ParamEntry, ParamType } from './CrtpService';

// Bump when the shape below changes, so old files are discarded rather than
// misread. The drone's CRC cannot catch a change on our side.
// Bumped to 2: version 1 caches were written before mission.wallfollow and
// mission.walldist were in the repair list, so they hold those names in their
// corrupted form. The cache key is (kind, count, crc) and none of those change
// when the app's repair table does, so without this bump a drone would keep
// loading the broken names forever and the app would keep insisting the
// firmware cannot wall follow.
//
// Bump this whenever the name repair tables in CrtpService change.
const CACHE_FORMAT_VERSION = 3;

const cacheDir = () => `${FileSystem.documentDirectory}toc-cache/`;

// One file per (kind, count, crc). Keying on the drone's own CRC means a
// reflash that changes the catalogue simply misses the cache instead of
// silently returning stale IDs — the failure mode that would be hardest to
// debug from the app.
const cacheFile = (kind: 'param' | 'log', count: number, crc: number) =>
  `${cacheDir()}${kind}-${count}-${crc >>> 0}.json`;

interface CachedToc {
  version: number;
  kind: 'param' | 'log';
  count: number;
  crc: number;
  entries: unknown[];
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(cacheDir());
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(cacheDir(), { intermediates: true });
  }
}

/**
 * Returns the cached catalogue for this exact (count, crc), or null on any
 * miss. Never throws: a cache problem must degrade to a slow connection, not
 * a failed one.
 */
export async function loadToc<T>(
  kind: 'param' | 'log',
  count: number,
  crc: number
): Promise<Map<string, T> | null> {
  try {
    const path = cacheFile(kind, count, crc);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;

    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as CachedToc;

    if (
      parsed.version !== CACHE_FORMAT_VERSION ||
      parsed.kind !== kind ||
      parsed.count !== count ||
      (parsed.crc >>> 0) !== (crc >>> 0) ||
      !Array.isArray(parsed.entries)
    ) {
      return null;
    }

    const map = new Map<string, T>();
    for (const e of parsed.entries as { fullName?: string }[]) {
      if (e && typeof e.fullName === 'string') map.set(e.fullName, e as T);
    }
    // An empty file is not a usable cache; treat it as a miss so the app
    // refetches rather than connecting with no variables at all.
    return map.size > 0 ? map : null;
  } catch (e) {
    console.warn('[toc-cache] load failed, will fetch from the drone:', e);
    return null;
  }
}

/**
 * Saves a freshly fetched catalogue. Never throws — failing to cache only
 * costs time on the next connection.
 */
export async function saveToc(
  kind: 'param' | 'log',
  count: number,
  crc: number,
  entries: Map<string, ParamEntry | LogEntry>,
  timeouts: number
): Promise<void> {
  try {
    // Gate on TIMEOUTS, not on map size.
    //
    // Comparing entries.size against count was wrong and defeated the cache
    // entirely: the map is keyed by name, and corrupted names collide after
    // repair, so a fully-read catalogue still lands short. Observed: the drone
    // reported 325 parameters and the map held 312, so nothing was ever
    // cached and every connection stayed slow.
    //
    // A timeout genuinely means we never saw that entry, and baking a
    // transient BLE glitch in permanently is the thing worth avoiding.
    if (timeouts > 0) {
      console.warn(
        `[toc-cache] not caching ${kind}: ${timeouts} entr${timeouts === 1 ? 'y' : 'ies'} timed out, ` +
          'so part of the catalogue is genuinely missing'
      );
      return;
    }
    if (entries.size < count) {
      console.log(
        `[toc-cache] ${kind}: caching ${entries.size} usable names of ${count} entries ` +
          '(the shortfall is duplicate names after repair, not missing data)'
      );
    }

    await ensureDir();
    const payload: CachedToc = {
      version: CACHE_FORMAT_VERSION,
      kind,
      count,
      crc: crc >>> 0,
      entries: Array.from(entries.values()),
    };
    await FileSystem.writeAsStringAsync(
      cacheFile(kind, count, crc),
      JSON.stringify(payload)
    );
    console.log(`[toc-cache] saved ${kind} catalogue (${entries.size} entries)`);
  } catch (e) {
    console.warn('[toc-cache] save failed, next connection will be slow:', e);
  }
}

/** Deletes every cached catalogue. For a "connection is behaving oddly" escape hatch. */
export async function clearTocCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(cacheDir());
    if (info.exists) await FileSystem.deleteAsync(cacheDir(), { idempotent: true });
    console.log('[toc-cache] cleared');
  } catch (e) {
    console.warn('[toc-cache] clear failed:', e);
  }
}

// Re-exported so callers do not need to import the entry types from two places.
export type { LogEntry, ParamEntry, ParamType };
