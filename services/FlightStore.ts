// ===========================================================================
//  SAFE TO CHANGE WITHOUT THE DRONE.
// ===========================================================================
//
// This file only reads flight data that has already been recorded and saved.
// Nothing here can stop the drone flying, send it a command, or corrupt what
// it stores. Break it and the worst case is a screen that looks wrong.
//
// This is the right place to work while the drone is unavailable. The 3D view,
// the flight cards, the measurements table and the summary numbers can all be
// developed against flights already on the phone.
//
// Two things it is worth knowing about the data itself:
//
//   Positions (posX/posY/posZ) are the drone's own estimate in metres. They are
//   real. An older version dead-reckoned a fake straight line here, which made
//   every flight look identical; if a path ever looks suspiciously tidy, check
//   that the real positions are actually present rather than being fallen back
//   from.
//
//   yaw is the heading in degrees and it is what places the wall readings. A
//   front reading of 800mm is 800mm in whatever direction the drone was facing,
//   and once it can turn that is not the same direction twice. yaw was
//   hardcoded to zero for a long time, which drew every wall of every flight as
//   though the drone never turned -- the path was right and the room around it
//   was fiction. Flights recorded before that fix have yaw 0 throughout and
//   will always look flat; that is the recording, not the renderer.
//
// The files that CAN stop the drone flying are marked FLIGHT-CRITICAL at the
// top: services/CrtpService.ts, services/TocCache.ts,
// contexts/DroneConnectionContext.tsx and app/mission.tsx.
// ===========================================================================

// Persistent storage for flights downloaded from the drone.
//
// One JSON file per flight under documentDirectory/flights/. A file per flight
// rather than one big list, so renaming or deleting one flight cannot corrupt
// the others, and a single unreadable file loses one flight instead of all of
// them.
//
// Everything here fails soft. A storage problem must degrade to "this flight is
// missing" and never to a crash mid-flight-download, because the drone's copy
// is cleared once the transfer completes and there is no second chance to ask.

import * as FileSystem from 'expo-file-system/legacy';
import type { Flight, FlightData } from '@/types/flightT';

const dir = () => `${FileSystem.documentDirectory}flights/`;
const fileFor = (id: string) => `${dir()}${id}.json`;

/** One measurement as the drone records it: position in mm, walls in mm. */
export interface RawSample {
  x: number;
  y: number;
  z: number;
  front: number;
  back: number;
  left: number;
  right: number;
  /** Optional: absent in flights recorded before these were captured. */
  up?: number;
  down?: number;
  /**
   * Heading in degrees, -180..180. Absent for flights recorded before the
   * drone could turn, where it was always zero anyway.
   */
  yaw?: number;
}

/** A stored flight. Extends the existing Flight shape the 3D view already reads. */
export interface StoredFlight extends Flight {
  /** Milliseconds since epoch, for ordering newest-first. */
  savedAt: number;
  /** Kept so a flight can be re-derived if the display format ever changes. */
  samples: RawSample[];
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir());
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir(), { intermediates: true });
  }
}

/**
 * Turns the drone's raw samples into the shape the 3D view and the summary
 * rows already expect.
 *
 * The drone works in millimetres and the display in metres, and it records once
 * per second, so sample index IS the time in seconds.
 */
export function buildFlight(
  samples: RawSample[],
  name: string,
  batteryUsage = 0
): StoredFlight {
  const mm = (v: number) => v / 1000;

  const flightPath: FlightData = {
    frontSensor: samples.map((s) => mm(s.front)),
    backSensor: samples.map((s) => mm(s.back)),
    leftSensor: samples.map((s) => mm(s.left)),
    rightSensor: samples.map((s) => mm(s.right)),
    // The REAL down-facing range, not the estimated altitude. They differ: z
    // is the position estimate, down is what the Flow deck's sensor actually
    // measures. Old flights have no up/down, so fall back rather than break.
    downSensor: samples.map((s) => mm(s.down ?? s.z)),
    TopSensor: samples.map((s) => mm(s.up ?? 0)),
    // The real heading, where the flight has one.
    //
    // This was hardcoded to zero, which was honest while the drone could not
    // turn and is wrong now that it can. Without it the wall distances cannot
    // be placed: a front reading of 800mm points a different way on every
    // sample of a flight that goes round a corner, and drawing them all as
    // though the drone faced one direction produces a picture that looks
    // nothing like the room it flew through.
    yaw: samples.map((s) => s.yaw ?? 0),
    pitch: samples.map(() => 0),
    roll: samples.map(() => 0),
    time: samples.map((_, i) => i),

    // The drone's real position. Without these the 3D view falls back to
    // dead-reckoning a straight line, which is what made every flight look
    // identical and wrong.
    posX: samples.map((s) => mm(s.x)),
    posY: samples.map((s) => mm(s.y)),
    posZ: samples.map((s) => mm(s.z)),
  };

  const maxAltitude = samples.length
    ? Math.max(...samples.map((s) => mm(s.z)))
    : 0;

  // Path length: straight-line distance between consecutive points. Understates
  // a curved path slightly, which is the honest direction to be wrong in.
  let distance = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = mm(samples[i].x - samples[i - 1].x);
    const dy = mm(samples[i].y - samples[i - 1].y);
    const dz = mm(samples[i].z - samples[i - 1].z);
    distance += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return {
    id: Date.now(),
    name,
    duration: samples.length,        // one sample per second
    maxAltitude: Number(maxAltitude.toFixed(2)),
    distance: Number(distance.toFixed(2)),
    batteryUsage,
    flightPath,
    video: '',
    savedAt: Date.now(),
    samples,
  };
}

/** Newest first. Returns [] on any problem rather than throwing. */
export async function listFlights(): Promise<StoredFlight[]> {
  try {
    await ensureDir();
    const names = await FileSystem.readDirectoryAsync(dir());
    const out: StoredFlight[] = [];
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      try {
        const raw = await FileSystem.readAsStringAsync(`${dir()}${n}`);
        const f = JSON.parse(raw) as StoredFlight;
        if (f && typeof f.name === 'string' && f.flightPath) {
          // Backfill real position for flights saved before it was stored.
          // The raw samples were always kept, so nothing has to be re-flown --
          // these flights just could not be drawn correctly until now.
          if (!f.flightPath.posX && Array.isArray(f.samples) && f.samples.length) {
            f.flightPath.posX = f.samples.map((p) => p.x / 1000);
            f.flightPath.posY = f.samples.map((p) => p.y / 1000);
            f.flightPath.posZ = f.samples.map((p) => p.z / 1000);
          }
          out.push(f);
        }
      } catch {
        // One corrupt file must not hide every other flight.
        console.warn(`[flights] could not read ${n}, skipping`);
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    console.warn('[flights] list failed:', e);
    return [];
  }
}

export async function saveFlight(f: StoredFlight): Promise<boolean> {
  try {
    await ensureDir();
    await FileSystem.writeAsStringAsync(fileFor(String(f.id)), JSON.stringify(f));
    console.log(`[flights] saved "${f.name}" (${f.samples.length} samples)`);
    return true;
  } catch (e) {
    console.error('[flights] SAVE FAILED:', e);
    return false;
  }
}

export async function renameFlight(id: number, name: string): Promise<boolean> {
  try {
    const raw = await FileSystem.readAsStringAsync(fileFor(String(id)));
    const f = JSON.parse(raw) as StoredFlight;
    f.name = name;
    await FileSystem.writeAsStringAsync(fileFor(String(id)), JSON.stringify(f));
    return true;
  } catch (e) {
    console.warn('[flights] rename failed:', e);
    return false;
  }
}

export async function deleteFlight(id: number): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(fileFor(String(id)), { idempotent: true });
    return true;
  } catch (e) {
    console.warn('[flights] delete failed:', e);
    return false;
  }
}
