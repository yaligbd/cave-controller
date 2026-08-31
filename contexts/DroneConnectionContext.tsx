// ===========================================================================
//  FLIGHT-CRITICAL FILE.  READ THIS BEFORE CHANGING ANYTHING BELOW.
// ===========================================================================
//
// This file connects to the drone, sets up telemetry, and is the thing that
// actually sends the command that makes it take off. A mistake here can leave
// the drone unreachable, flying blind, or flying when it should not be.
//
// The drone cannot be tested against right now. Assume any change here is
// unverifiable until it is back.
//
// THE THREE THINGS MOST LIKELY TO BREAK FLYING
//
// 1. THE LOG BLOCKS ARE STAGGERED ON PURPOSE (500ms, 1500ms, 3000ms).
//    NEVER create two log blocks back to back. Their fragments interleave and
//    whichever block loses the race is silently destroyed -- the drone answers
//    "start block 0: OK" and then sends nothing at all.
//    This rule was written down and then broken by the block-recovery code,
//    which rebuilt all three at once. The result was a repair loop that fed
//    itself: blocks vanished, recovery destroyed them again rebuilding them,
//    telemetry died, and flights were recorded as 1mm of altitude while the
//    drone was in the air reporting a 568mm climb. rebuildLogBlocks() exists to
//    hold that line -- ONE block at a time, 1500ms apart, one rebuild at once.
//    Do not "simplify" it into a loop.
//
// 2. THE NULL PACKET IS NOT IDLE CHATTER.
//    When the send queue is empty the pump sends a null packet, and that is
//    what makes the nRF51 bridge flush its DOWNLINK buffer. It is how the
//    drone's replies reach the phone at all.
//    Slowing it from 10ms to 60ms once cut the reply rate by six: three-byte
//    log acknowledgements started taking twenty seconds, every download timed
//    out, and all the answers then arrived together in a burst. That is why
//    downloadActiveRef exists -- the pump runs flat out for the whole of a
//    download and idles only when nothing is expected. Do not slow the pump
//    down to "reduce congestion". That theory was tested and it was wrong.
//
// 3. setParam('mission.state', 1) TAKES OFF. IMMEDIATELY.
//    There is no confirmation and no second step. Anything that can reach that
//    call must be certain the drone is on the ground and the pilot meant it.
//    mission.state = 2 aborts and lands.
//
// ALSO WORTH KNOWING
//
// - waitForConsoleQuiet() observes for 2.5s before believing the link is quiet.
//   Silence BEFORE the boot log looks identical to silence after it, and the
//   short version dived in during the boot and timed out the catalogue fetch on
//   every single power cycle. Do not shorten it.
//
// - A download pauses the log blocks and MUST restart them. resumeLogBlocks()
//   then checks that data actually resumed, because a START the drone never
//   acted on leaves telemetry silently dead and the next flight records zeros.
//
// - stopFlightRecording() discards a recording whose peak altitude is under
//   100mm. That is not over-caution: the recorder runs on a fixed window and
//   has no idea whether the drone ever left the ground, and it was saving
//   flights that never happened. Do not remove the check to "keep more data".
//
// SAFE TO CHANGE ELSEWHERE: FlightStore.ts, FlightDataModal.tsx,
// flightCard.tsx, SimulatorWebView.tsx, and the screens other than mission.tsx
// only read data that already exists. Nothing in them can stop the drone
// flying, so that is where to work while the drone is unavailable.
// ===========================================================================

import React, { createContext, useContext, useRef, useState } from 'react';
import { loadToc, saveToc } from '@/services/TocCache';
import {
  bulkClearPacket,
  bulkDumpPacket,
  parseBulkEof,
  parseBulkSample,
  PORT_BULK,
  type BulkSample,
} from '@/services/CrtpService';
import { buildFlight, saveFlight, type RawSample } from '@/services/FlightStore';
import { LOG_BLOCK_MAX_BYTES, LOG_TYPE_SIZE } from '@/services/CrtpService';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';

import {
  base64ToBytes,
  bytesToBase64,
  crtpChannel,
  crtpPort,
  CrtpReassembler,
  decodeLogData,
  fragmentForBle,
  LOG_CHAN_CTRL,
  LOG_CHAN_DATA,
  LOG_CHAN_TOC,
  LOG_CMD_GET_INFO,
  LOG_CMD_GET_ITEM,
  logCreateBlockPacket,
  logDeleteBlockPacket,
  LogEntry,
  logGetInfoPacket,
  logGetItemPacket,
  logStartBlockPacket,
  logStopBlockPacket,
  PARAM_CHAN_READ,
  PARAM_CHAN_TOC,
  PARAM_CMD_GET_INFO,
  PARAM_CMD_GET_ITEM,
  ParamEntry,
  paramGetInfoPacket,
  paramGetItemPacket,
  paramReadPacket,
  ParamType,
  paramWritePacket,
  parseLogInfo,
  parseLogItem,
  parseParamInfo,
  parseParamItem,
  parseParamValue,
  PORT_CONSOLE,
  PORT_LOG,
  PORT_PARAM,
} from '@/services/CrtpService';

// Official Bitcraze CRTP-over-BLE UUIDs
export const CRAZYFLIE_SERVICE = '00000201-1c7f-4f9e-947b-43b7c00a9a08';
export const CRAZYFLIE_CRTP = '00000202-1c7f-4f9e-947b-43b7c00a9a08'; // simple, 20-byte limited, no control byte
export const CRAZYFLIE_CRTP_UP = '00000203-1c7f-4f9e-947b-43b7c00a9a08'; // phone -> drone
export const CRAZYFLIE_CRTP_DOWN = '00000204-1c7f-4f9e-947b-43b7c00a9a08'; // drone -> phone, notify only
// Kept for app/mission.tsx, which writes directly to this characteristic.
export const CRAZYFLIE_RX = CRAZYFLIE_CRTP_UP;

// Diagnostics only — logs every raw CRTP frame/packet over BLE so we can see
// exactly what goes over the wire. Does not affect protocol behavior.
const CRTP_DEBUG = false;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

const SCAN_TIMEOUT_MS = 10000;
// 1000ms was too short: the drone floods the link with console text on boot,
// and a TOC reply queued behind that flood arrived AFTER the request had
// already been declared failed. The reply was never missing, only late.
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

// The nRF51 BLE bridge only pushes a CRTPDOWN notification in response to a
// CRTPUP/CRTP write — it never sends anything unprompted. To match the
// official iOS client, we keep a continuous poll running: real packets are
// queued and sent in order, and whenever the queue is empty we send a single
// null byte just to keep the bridge flushing its downlink buffer.
const NULL_PACKET = new Uint8Array([0xff]);
const POLL_DELAY_MS = 10;
// How long to wait before sending ANOTHER null packet when there is nothing
// real to send.
//
// The pump sent a null packet every 10ms whenever the queue was empty -- about
// a hundred uplink writes a second, forever. On a link with 20 usable bytes a
// packet that starves the downlink, and the log shows it getting worse across
// a session: the achieved send rate fell from ~50 packets per heartbeat to
// ~15, and the drone's replies stopped arriving on time. Not just bulk data --
// three-byte log-control acknowledgements were taking over fifteen seconds,
// then landing all at once in a burst. That is a queue draining, not a drone
// thinking.
//
// Idling at 60ms still pumps the bridge many times a second while leaving the
// radio free to actually deliver what the drone is sending back. Real queued
// traffic is unaffected and still goes out at POLL_DELAY_MS.
const POLL_IDLE_DELAY_MS = 60;
// A BLE write that never resolves (peripheral never sends the GATT response)
// would otherwise wedge the poll loop forever — the only thing that
// reschedules the next send is this write's own .finally(). Racing it against
// a timeout guarantees the loop always gets control back.
const WRITE_TIMEOUT_MS = 2000;
const POLL_HEARTBEAT_MS = 5000;

// Parameter-polling telemetry — built as a workaround under the (wrong)
// assumption that log streaming couldn't work over BLE. It turned out log
// streaming does work; this was based on a bad diagnosis. Kept in place,
// disabled, as a fallback in case that regresses again — flip this on to
// re-enable polling instead of (or alongside) log-block streaming.
const TELE_POLLING_ENABLED = false;
const TELE_PARAM_NAMES = [
  'tele.vbat',
  'tele.front',
  'tele.back',
  'tele.left',
  'tele.right',
  'tele.up',
  'tele.down',
  'tele.x',
  'tele.y',
  'tele.z',
];
const TELE_POLL_INTERVAL_MS = 500;
const TELE_READ_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

let _bleManager: BleManager | null = null;
let _bleManagerFailed = false;

function getBleManager(): BleManager | null {
  if (_bleManager) return _bleManager;
  if (_bleManagerFailed) return null;
  try {
    _bleManager = new BleManager();
    return _bleManager;
  } catch (error) {
    _bleManagerFailed = true;
    console.warn('[drone] BleManager unavailable — native BLE module not present:', error);
    return null;
  }
}

interface TocProgress {
  loaded: number;
  total: number;
}

// A step-by-step trail of what the BLE connect flow is doing, so the UI can
// always show the user something instead of appearing to do nothing.
export type BleStatus =
  | 'idle'
  | 'requesting-permission'
  | 'permission-denied'
  | 'bluetooth-off'
  | 'scanning'
  | 'found'
  | 'connecting'
  | 'connected'
  | 'fetching-toc'
  | 'error';

interface PendingRequest {
  match: (packet: Uint8Array) => boolean;
  resolve: (packet: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface DroneContextType {
  isConnected: boolean;
  connectedDevice: Device | null;
  params: Map<string, ParamEntry>;
  tocProgress: TocProgress;
  bleAvailable: boolean;
  bleStatus: BleStatus;
  bleError: string | null;
  scanForDrone: () => Promise<void>;
  disconnectFromDrone: () => Promise<void>;
  setParam: (fullName: string, value: number, typeOverride?: ParamType) => Promise<void>;
  findParam: (name: string) => ParamEntry | undefined;
  runCrtpProbe: () => Promise<void>;
  logVars: Map<string, LogEntry>;
  logTocProgress: TocProgress;
  logValues: Map<string, number>;
  /** Drone's boot self-test: null = unknown, false = FAILED and it will not fly. */
  selftestPassed: boolean | null;
  /** True while the phone is sampling a flight from the live stream. */
  isRecording: boolean;
  startFlightRecording: () => void;
  /** Saves and returns the sample count; 0 if nothing worth keeping. */
  stopFlightRecording: (name: string) => Promise<number>;
  /** Downloads the drone's own recording and saves it. Returns samples saved. */
  downloadFlightFromDrone: (name: string) => Promise<number>;
  /** Tells the drone to discard its recording. */
  clearDroneRecording: () => void;
  startLogBlock: (blockId: number, names: string[], periodMs: number) => void;
  stopLogBlock: (blockId: number) => void;
  hasLogVar: (name: string) => boolean;
  teleValues: Map<string, number>;
}

const DroneContext = createContext<DroneContextType | null>(null);

export function DroneConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [params, setParams] = useState<Map<string, ParamEntry>>(new Map());
  const [tocProgress, setTocProgress] = useState<TocProgress>({ loaded: 0, total: 0 });
  const [bleStatus, setBleStatus] = useState<BleStatus>('idle');
  const [bleError, setBleError] = useState<string | null>(null);
  const [logVars, setLogVars] = useState<Map<string, LogEntry>>(new Map());
  const [logTocProgress, setLogTocProgress] = useState<TocProgress>({ loaded: 0, total: 0 });
  const [logValues, setLogValues] = useState<Map<string, number>>(new Map());
  // Mirror of logValues for the recording interval. A setInterval closure
  // captures state once and would record the same frozen sample forever.
  const logValuesRef = useRef<Map<string, number>>(new Map());
  // The drone's own boot self-test result, read once per connection.
  // null = not read yet, true = booted normally, false = self-test FAILED.
  //
  // This matters more than it looks. When the self-test fails the firmware
  // never calls systemStart(): no stabilizer, no log streaming, no app layer.
  // Log blocks are still accepted and then silently send nothing, and mission
  // commands are silently ignored, because nothing is running to act on them.
  // Without surfacing this, that state is indistinguishable from a bug in this
  // app -- which is exactly how it was read for several rounds.

  // Sticky across the connection, so a later unrelated console line cannot
  // quietly clear a failure the user has not seen yet.
  const bootFailedRef = useRef(false);

  // Receives flight-download packets while a download is running. A ref rather
  // than state because packets arrive far faster than React would re-render,
  // and the handler must see the current collector, not a captured one.
  const bulkCollectorRef = useRef<{
    onSample: (s: BulkSample) => void;
    onDone: (count: number) => void;
  } | null>(null);

  // --- Flight recording, phone side -------------------------------------
  // The drone does not yet store a flight itself, so while the app is
  // connected it samples the live stream once a second and saves the result
  // as a flight. Same shape the drone will eventually hand over, so the 3D
  // view and the flight cards do not change when recording moves onboard.
  //
  // Samples live in a ref, not state: this appends once a second for a whole
  // flight, and re-rendering the tree on every sample would be pure waste.
  const recordSamplesRef = useRef<RawSample[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selftestPassed, setSelftestPassed] = useState<boolean | null>(null);
  const [teleValues, setTeleValues] = useState<Map<string, number>>(new Map());

  // Every stage of the connect flow goes through here so the UI always has
  // something to show — "no visible response" is exactly the bug this exists
  // to prevent.
  const setStatus = (status: BleStatus, error: string | null = null) => {
    console.log(`[drone] status -> ${status}${error ? ` (${error})` : ''}`);
    setBleStatus(status);
    setBleError(error);
  };

  // Mirrors of the params/logVars state, read by logic that runs inside async
  // chains (findParam, setParam, startLogBlock). setParams/setLogVars land on
  // the next render, which is too late for a caller that calls e.g.
  // fetchLogToc().then(() => startLogBlock(...)) — the .then() callback still
  // closes over the state as it was when the effect/handler first ran. Refs
  // are updated synchronously, so they're always current.
  const paramsRef = useRef<Map<string, ParamEntry>>(new Map());
  const logVarsRef = useRef<Map<string, LogEntry>>(new Map());

  // Read inside async BLE callbacks — useState values would go stale in those closures.
  const deviceRef = useRef<Device | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const reassemblerRef = useRef(new CrtpReassembler());
  const pendingRef = useRef<PendingRequest[]>([]);
  const pidRef = useRef(0);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Diagnostics only — counts [crtp rx raw] notifications that arrive while
  // runCrtpProbe() is running, so the probe summary line is accurate.
  const probeActiveRef = useRef(false);
  const probeRxCountRef = useRef(0);

  // Continuous send/poll loop — see NULL_PACKET comment above.
  const packetQueueRef = useRef<Uint8Array[]>([]);
  const pollingActiveRef = useRef(false);
  const sendingRef = useRef(false);
  // Diagnostics only — proves the poll loop is still alive; see POLL_HEARTBEAT_MS.
  const pollSentCountRef = useRef(0);
  const pollHeartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timestamp of the most recent port-0 (console) packet, used to detect when
  // the drone's post-connect boot log dump has finished. 0 means "none seen".
  const lastConsolePacketAtRef = useRef<number>(0);
  // Diagnostics only — the last packet handlePacket saw, regardless of
  // whether it matched a pending request, so a timeout can show what (if
  // anything) actually arrived.
  const lastPacketSeenRef = useRef<Uint8Array | null>(null);

  // The entry list a running log block was created with, keyed by blockId,
  // so incoming data packets can be decoded back into named values.
  const logBlocksRef = useRef<Map<number, LogEntry[]>>(new Map());
  // How fast each block was asked to stream. Kept so a block that is paused
  // for a download can be resumed at its original rate rather than guessed at.
  const logPeriodsRef = useRef<Map<number, number>>(new Map());
  // How many times each block has been rebuilt after vanishing from the drone.
  const blockRecoveryRef = useRef<Map<number, number>>(new Map());
  // True while a download is running, so the packet pump knows to work at full
  // speed instead of idling.
  const downloadActiveRef = useRef(false);
  // Block ids that have delivered at least one data packet since being started.
  const blocksSeenRef = useRef<Set<number>>(new Set());
  // When log data last arrived. Lets the app answer "is telemetry actually
  // flowing?" rather than assuming it is because a start command was sent.
  const lastLogDataAtRef = useRef<number>(0);
  // Temporary diagnostic — logs at most once per block if a data packet ever
  // decodes fewer values than the block has variables (e.g. a short/truncated
  // notification), instead of flooding on every packet.
  const warnedShortLogBlocksRef = useRef<Set<number>>(new Set());

  // Telemetry-by-polling — see TELE_PARAM_NAMES comment above.
  const teleValuesRef = useRef<Map<string, number>>(new Map());
  const teleActiveRef = useRef(false);
  const teleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Consecutive-timeout count per name, so a persistently-missing variable
  // logs once in a while instead of never or every single cycle.
  const teleTimeoutCountRef = useRef<Map<string, number>>(new Map());

  const requestAndroidPermissions = async (): Promise<{ ok: boolean; deniedPermission?: string }> => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      if (granted['android.permission.BLUETOOTH_SCAN'] !== PermissionsAndroid.RESULTS.GRANTED) {
        return { ok: false, deniedPermission: 'Bluetooth Scan' };
      }
      if (granted['android.permission.BLUETOOTH_CONNECT'] !== PermissionsAndroid.RESULTS.GRANTED) {
        return { ok: false, deniedPermission: 'Bluetooth Connect' };
      }
      return { ok: true };
    }
    return { ok: true };
  };

  const removePending = (entry: PendingRequest) => {
    pendingRef.current = pendingRef.current.filter((e) => e !== entry);
  };

  const logConsolePacket = (packet: Uint8Array) => {
    let text = '';
    for (let i = 1; i < packet.length; i++) {
      text += String.fromCharCode(packet[i]);
    }
    console.log('[drone]', text);

    // Read the drone's boot result out of its own console output.
    //
    // The earlier attempt read the system.selftestPassed PARAMETER instead,
    // and that does not work: names arrive corrupted over BLE and are repaired
    // against a table, and a long name like that one does not survive. Its
    // absence was reported as "missing from the TOC", so the check never ran.
    //
    // The console text is not name-dependent, and these two lines are printed
    // by the stock firmware on every boot, so this works regardless of which
    // CaveBat build is flashed. Matching is loose because BLE drops one byte
    // per fragment boundary: "Self test passed!" can arrive as "Self test
    // pased!", and "[FAIL]" has been seen intact but is checked with the
    // surrounding text kept short for the same reason.
    // Match on [FAIL] alone. Anchoring on surrounding words does not survive
    // the byte loss: 'Deck 1 test [FAIL]' arrives as 'Deck 1 est [FAIL]'.
    // No line in a healthy boot contains [FAIL], so this is specific enough.
    if (text.includes('[FAIL]')) {
      bootFailedRef.current = true;
      setSelftestPassed(false);
      console.error(
        '[drone] BOOT SELF-TEST FAILED — the drone reported: "' + text.trim() + '". ' +
        'When this happens the firmware never starts: no flying, no live data, ' +
        'and every command is ignored. Nothing this app sends will have any effect.'
      );
    } else if (/Self test pa?sed/i.test(text)) {
      bootFailedRef.current = false;
      setSelftestPassed(true);
      console.log('[drone] boot self-test passed');
    }
  };

  const PORT_LINKCTRL = 15;

  // Log data streams continuously once a block is running — decode and store
  // it. The per-packet [log data] log below is a TEMPORARY diagnostic added
  // to find why no data was arriving; remove it (or the CRTP_DEBUG-style
  // gating) once confirmed working, it will flood the console otherwise.
  // Rebuild log blocks that have vanished from the drone -- ONE AT A TIME.
  //
  // This is the rule already written in CLAUDE.md, which the first version of
  // this recovery broke: "Never create two log blocks back to back. Their
  // fragments interleave and whichever block loses the race is silently
  // destroyed, with no error anywhere."
  //
  // Recovery was firing delete+create+start for all three blocks back to back,
  // so the blocks it was repairing destroyed each other on the way in. The
  // drone answered "log start block 0: OK" and then sent nothing, the next
  // flight recorded 1mm of altitude for a 568mm climb, and the download after
  // that reported ENOENT -- which triggered another simultaneous rebuild. A
  // repair loop that fed itself, getting worse the longer a session ran.
  //
  // Staggering matches what connection setup already does successfully (500ms,
  // 1500ms, 3000ms), and one rebuild runs at a time: the ENOENT handler and the
  // post-download check both used to fire for the same blocks at once.
  const rebuildPendingRef = useRef<Set<number>>(new Set());
  const rebuildRunningRef = useRef(false);

  const rebuildLogBlocks = (ids: number[], why: string) => {
    for (const id of ids) rebuildPendingRef.current.add(id);
    if (rebuildRunningRef.current) return;
    rebuildRunningRef.current = true;

    const next = () => {
      const id = rebuildPendingRef.current.values().next().value;
      if (id === undefined) {
        rebuildRunningRef.current = false;
        return;
      }
      rebuildPendingRef.current.delete(id);

      const entries = logBlocksRef.current.get(id);
      const period = logPeriodsRef.current.get(id);
      if (entries && period !== undefined) {
        console.warn(`[drone] rebuilding log block ${id} (${why})`);
        sendPacket(logDeleteBlockPacket(id));
        sendPacket(logCreateBlockPacket(id, entries));
        sendPacket(logStartBlockPacket(id, period));
      }
      // Wait before the next one even if this one was skipped, so a skip cannot
      // collapse the gap that makes staggering work.
      setTimeout(next, 1500);
    };
    next();
  };

  const handleLogData = (packet: Uint8Array) => {
    lastLogDataAtRef.current = Date.now();
    const blockId = packet[1];
    if (!blocksSeenRef.current.has(blockId)) {
      blocksSeenRef.current.add(blockId);
      console.log(`[drone] log block ${blockId}: first data packet received`);
    }
    const entries = logBlocksRef.current.get(blockId);
    if (!entries) {
      const known = Array.from(logBlocksRef.current.keys()).join(', ') || 'none';
      console.log(`[log data] blockId=${blockId} has no registered entries — dropping (known blocks: ${known})`);
      return;
    }
    const decoded = decodeLogData(packet, entries);
    if (!decoded) {
      console.log(`[log data] blockId=${blockId} decodeLogData returned null, bytes=${toHex(packet)}`);
      return;
    }

    if (decoded.values.length < entries.length && !warnedShortLogBlocksRef.current.has(blockId)) {
      warnedShortLogBlocksRef.current.add(blockId);
      const missing = entries.slice(decoded.values.length).map((e) => e.fullName).join(', ');
      console.warn(
        `[drone] log block ${blockId} data packet only decoded ${decoded.values.length}/${entries.length} values — missing: ${missing}`
      );
    }

    setLogValues((prev) => {
      const next = new Map(prev);
      entries.forEach((entry, i) => {
        if (i < decoded.values.length) next.set(entry.fullName, decoded.values[i]);
      });
      logValuesRef.current = next;
      return next;
    });
  };

  const handlePacket = (packet: Uint8Array) => {
    lastPacketSeenRef.current = packet;
    if (packet.length === 0) return;

    if (crtpPort(packet[0]) === PORT_LOG) {
      if (crtpChannel(packet[0]) === LOG_CHAN_DATA) {
        if (CRTP_DEBUG) console.log(`[log data] blockId=${packet[1]} bytes=${toHex(packet)}`);
        handleLogData(packet);
        return;
      }
      // The drone answers every log control command (create / start / stop /
      // delete) with [cmd, blockId, errorCode]. The app used to discard these,
      // so a rejected block looked identical to a working one: the app said
      // "started log block 0" and then simply never received any data, with
      // nothing anywhere saying why. Surface it.
      if (crtpChannel(packet[0]) === LOG_CHAN_CTRL && packet.length >= 4) {
        const cmd = packet[1];
        const blockId = packet[2];
        const err = packet[3];
        const cmdName =
          cmd === 0 ? 'create' : cmd === 1 ? 'append' : cmd === 2 ? 'delete'
          : cmd === 3 ? 'start' : cmd === 4 ? 'stop' : cmd === 5 ? 'RESET-ALL'
          : cmd === 6 ? 'create-v2' : cmd === 7 ? 'append-v2'
          : cmd === 8 ? 'start-v2' : `cmd${cmd}`;
        if (err === 0) {
          console.log(`[drone] log ${cmdName} block ${blockId}: OK`);
        } else if (cmd === 2 && err === 2) {
          // Deleting a block that was never created. Expected on a fresh
          // connection, since we always delete before creating.
          console.log(`[drone] log delete block ${blockId}: nothing to delete (fine)`);
        } else {
          // errno values from the firmware: 2 = ENOENT (no such block/variable),
          // 7 = E2BIG (block too large), 12 = ENOMEM (out of blocks/memory),
          // 17 = EEXIST (that block id is already in use).
          const meaning =
            err === 2 ? 'ENOENT — a variable in the block does not exist on this firmware'
            : err === 7 ? 'E2BIG — block payload exceeds the 26-byte limit'
            : err === 12 ? 'ENOMEM — the drone is out of log blocks or memory'
            : err === 17 ? 'EEXIST — that block id is already registered on the drone'
            : `errno ${err}`;
          console.error(`[drone] log ${cmdName} block ${blockId} FAILED: ${meaning}`);

          // A start or stop that returns ENOENT means the block is GONE from
          // the drone -- not that a variable is missing. Telemetry then stays
          // silently dead, logValues stops updating, and the phone-side
          // recorder keeps saving whatever it last saw. That is how three
          // "flights" came to be stored as 19 samples of pure zero while the
          // drone was in the air reporting a 566mm climb, and why the 3D view
          // drew three different pictures of one repeated flight.
          //
          // Rebuild it from the definition we already hold, rather than
          // leaving the link half dead until the next reconnect.
          if (err === 2 && (cmd === 3 || cmd === 4)) {
            const tries = blockRecoveryRef.current.get(blockId) ?? 0;
            if (tries < 3) {
              blockRecoveryRef.current.set(blockId, tries + 1);
              rebuildLogBlocks([blockId], `gone from the drone, attempt ${tries + 1} of 3`);
            } else {
              // Stop trying rather than rebuild forever on a link that is
              // refusing. Three failures is a real fault, not a glitch.
              console.error(
                `[drone] log block ${blockId} could not be rebuilt after 3 attempts. ` +
                'Telemetry for it stays dead until you reconnect.'
              );
            }
          }
        }
        // A block that answers anything successfully is healthy again, so its
        // recovery count must not carry over to a later, unrelated failure.
        if (err === 0) blockRecoveryRef.current.delete(blockId);
        return;
      }

      // Fires for every log-TOC reply -- one per log variable, and this
      // firmware has ~370 of them. Ungated, it doubled an already huge console
      // stream and slowed the TOC fetch to minutes.
      if (CRTP_DEBUG) {
        console.log(
          `[log rx] port=5 packet NOT routed to log data handler — channel=${crtpChannel(packet[0])} (data channel is ${LOG_CHAN_DATA}), bytes=${toHex(packet)}`
        );
      }
    }

    if (CRTP_DEBUG) console.log(`[crtp rx packet] ${toHex(packet)}`);
    if (CRTP_DEBUG && crtpPort(packet[0]) === PORT_LINKCTRL) {
      let ascii = '';
      for (let i = 1; i < packet.length; i++) {
        ascii += String.fromCharCode(packet[i]);
      }
      console.log(`[crtp rx port15 ascii] ${ascii}`);
    }
    // Flight download. Only meaningful while a download is in progress; at any
    // other time these cannot arrive, because the drone only sends them when
    // asked.
    if (crtpPort(packet[0]) === PORT_BULK) {
      const collector = bulkCollectorRef.current;
      if (collector) {
        const eofCount = parseBulkEof(packet);
        if (eofCount !== null) {
          collector.onDone(eofCount);
          return;
        }
        const sample = parseBulkSample(packet);
        if (sample) collector.onSample(sample);
      }
      return;
    }

    if (crtpPort(packet[0]) === PORT_CONSOLE) {
      lastConsolePacketAtRef.current = Date.now();
      logConsolePacket(packet);
      return;
    }
    const entry = pendingRef.current.find((e) => e.match(packet));
    if (entry) entry.resolve(packet);
  };

  // Low-level write, called only from the poll loop below — never call this
  // directly, use sendPacket() to enqueue instead.
  const writeCrtpBytes = async (packet: Uint8Array, isNullPacket: boolean) => {
    const device = deviceRef.current;
    if (!device) return;

    if (packet.length <= 20) {
      if (CRTP_DEBUG && !isNullPacket) console.log(`[crtp tx] ${toHex(packet)}`);
      await device.writeCharacteristicWithResponseForService(
        CRAZYFLIE_SERVICE,
        CRAZYFLIE_CRTP,
        bytesToBase64(packet)
      );
      return;
    }

    const pid = pidRef.current;
    pidRef.current = (pid + 1) & 0x03;

    const frames = fragmentForBle(packet, pid);
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (CRTP_DEBUG) console.log(`[crtp tx] frame ${i + 1}/${frames.length}: ${toHex(frame)}`);
      await device.writeCharacteristicWithoutResponseForService(
        CRAZYFLIE_SERVICE,
        CRAZYFLIE_CRTP_UP,
        bytesToBase64(frame)
      );
    }
  };

  // Enqueue a packet for transmission. The poll loop below drains this in
  // order; when it's empty the loop sends a null packet instead so the
  // nRF51 bridge keeps flushing its downlink buffer.
  const sendPacket = (packet: Uint8Array) => {
    packetQueueRef.current.push(packet);
  };

  const sendNext = () => {
    if (!pollingActiveRef.current || sendingRef.current) return;
    sendingRef.current = true;

    const queued = packetQueueRef.current.shift();
    const packet = queued ?? NULL_PACKET;
    // Pace by what was actually sent: back-to-back when there is real traffic
    // to move, unhurried when we are only keeping the bridge alive.
    // I had this wrong, and the last session's log shows the cost.
    //
    // The null packet is not idle chatter -- it is what makes the nRF51 bridge
    // flush its DOWNLINK buffer. Slowing it from 10ms to 60ms to reduce
    // congestion cut the rate at which the drone's replies could reach the
    // phone by six. Replies that used to be three seconds late became twenty
    // seconds late: all three download attempts timed out, and then all three
    // answers arrived together afterwards, along with log acknowledgements
    // that had been waiting just as long.
    //
    // So the pump idles gently when nothing is expected, and runs flat out
    // while a download is in flight -- which is precisely when there is a
    // backlog to pull down.
    const nextDelay =
      (queued !== undefined || downloadActiveRef.current)
        ? POLL_DELAY_MS
        : POLL_IDLE_DELAY_MS;
    pollSentCountRef.current += 1;

    // Timeout-wrapped: a write that never settles must not be able to wedge
    // sendingRef at true forever — that would silently stop the whole loop,
    // since nothing else ever reschedules the next send.
    withTimeout(writeCrtpBytes(packet, queued === undefined), WRITE_TIMEOUT_MS, 'CRTP write')
      .catch((error) => {
        console.error('[drone] CRTP write failed:', error);
      })
      .finally(() => {
        sendingRef.current = false;
        if (pollingActiveRef.current) {
          setTimeout(sendNext, nextDelay);
        }
      });
  };

  const startPolling = () => {
    if (pollingActiveRef.current) return;
    pollingActiveRef.current = true;
    pollSentCountRef.current = 0;
    sendNext();

    pollHeartbeatIntervalRef.current = setInterval(() => {
      console.log(
        `[crtp poll] alive, sent=${pollSentCountRef.current} packets, queue=${packetQueueRef.current.length}`
      );
    }, POLL_HEARTBEAT_MS);
  };

  const stopPolling = () => {
    pollingActiveRef.current = false;
    packetQueueRef.current = [];
    if (pollHeartbeatIntervalRef.current) {
      clearInterval(pollHeartbeatIntervalRef.current);
      pollHeartbeatIntervalRef.current = null;
    }
  };

  const request = (
    packet: Uint8Array,
    match: (packet: Uint8Array) => boolean,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const entry: PendingRequest = {
        match,
        resolve: (packet) => {
          clearTimeout(entry.timer);
          removePending(entry);
          resolve(packet);
        },
        reject: (error) => {
          clearTimeout(entry.timer);
          removePending(entry);
          reject(error);
        },
        timer: setTimeout(() => {
          removePending(entry);
          const lastPacket = lastPacketSeenRef.current;
          console.log(
            `[crtp] timeout — last packet seen was ${lastPacket ? toHex(lastPacket) : '(none)'}`
          );
          reject(new Error('CRTP request timed out'));
        }, timeoutMs),
      };
      pendingRef.current.push(entry);

      sendPacket(packet);
    });
  };

  // The drone dumps its whole boot log over the console port right after
  // connecting — dozens of packets that can congest the BLE link long enough
  // to blow past a short request timeout. Wait for it to go quiet first.
  const waitForConsoleQuiet = async () => {
    const QUIET_WINDOW_MS = 500;
    const MAX_WAIT_MS = 12000;
    // Watch for at least this long before believing the silence.
    //
    // The old version asked "has a console packet arrived in the last 500ms?"
    // and on a freshly booted drone the answer is no -- because the boot log
    // has not STARTED yet. So it declared the link quiet, requested the
    // catalogue, and the entire boot log then landed on top of the request and
    // timed it out. That is why the first connection after every power cycle
    // failed and the second worked: by the second the drone had finished
    // talking.
    //
    // Silence before the noise looks identical to silence after it. Only time
    // tells them apart.
    const MIN_OBSERVE_MS = 2500;
    const start = Date.now();
    for (;;) {
      const waited = Date.now() - start;
      if (waited >= MAX_WAIT_MS) break;
      const quiet = Date.now() - lastConsolePacketAtRef.current >= QUIET_WINDOW_MS;
      if (quiet && waited >= MIN_OBSERVE_MS) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log('[crtp] console quiet, requesting TOC');
  };

  // Runs the catalogue fetch, and tries again if it fails.
  //
  // Each attempt starts from scratch, which is safe: a partial fetch is
  // discarded rather than cached, and both fetchers are idempotent.
  const withTocRetry = async (fetchAll: () => Promise<void>): Promise<void> => {
    const ATTEMPTS = 3;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        await fetchAll();
        return;
      } catch (error) {
        if (attempt === ATTEMPTS) throw error;
        console.warn(
          `[drone] catalogue fetch failed (attempt ${attempt} of ${ATTEMPTS}), retrying: ` +
          (error instanceof Error ? error.message : String(error))
        );
        // Give the link a moment. Re-asking instantly just queues a second
        // request behind whatever swamped the first.
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  };

  const fetchParamToc = async () => {
    setTocProgress({ loaded: 0, total: 0 });

    await waitForConsoleQuiet();

    const infoRequestPacket = paramGetInfoPacket();
    if (CRTP_DEBUG) console.log(`[crtp] requesting param TOC info, packet = ${toHex(infoRequestPacket)}`);

    const infoPacket = await request(
      infoRequestPacket,
      (pkt) => crtpPort(pkt[0]) === PORT_PARAM && crtpChannel(pkt[0]) === PARAM_CHAN_TOC && pkt[1] === PARAM_CMD_GET_INFO,
      5000
    );
    const info = parseParamInfo(infoPacket);
    if (!info) throw new Error('Failed to parse parameter TOC info');

    const { count, crc } = info;

    // The drone hands out a CRC of its catalogue before we walk it. If it
    // matches a catalogue we already saved, the IDs cannot have moved, so
    // skip ~312 round trips. This is the difference between a 4-minute
    // connection and a 2-second one.
    const cachedParams = await loadToc<ParamEntry>('param', count, crc);
    if (cachedParams) {
      console.log(`[drone] param TOC from cache: ${cachedParams.size} entries (skipped ${count} round trips)`);
      paramsRef.current = cachedParams;
      setParams(cachedParams);
      setTocProgress({ loaded: count, total: count });
      return;
    }

    console.log(`[drone] param TOC not cached, fetching ${count} entries — this is slow, but only once per firmware build`);
    setTocProgress({ loaded: 0, total: count });

    const entries = new Map<string, ParamEntry>();
    let paramTimeouts = 0;
    for (let id = 0; id < count; id++) {
      try {
        const itemPacket = await request(
          paramGetItemPacket(id),
          (pkt) => crtpPort(pkt[0]) === PORT_PARAM && crtpChannel(pkt[0]) === PARAM_CHAN_TOC && pkt[1] === PARAM_CMD_GET_ITEM,
          3000
        );
        const entry = parseParamItem(itemPacket);
        if (entry) entries.set(entry.fullName, entry);
      } catch {
        paramTimeouts += 1;
        console.warn(`[drone] Timed out fetching param TOC entry ${id}, skipping`);
      }
      setTocProgress({ loaded: id + 1, total: count });
    }

    await saveToc('param', count, crc, entries, paramTimeouts);

    paramsRef.current = entries;
    setParams(entries);
    for (const entry of entries.values()) {
      if (entry.fullName.startsWith('mission.')) {
        console.log(`[drone] param ${entry.fullName} (id ${entry.id}, ${entry.type})`);
      }
    }

    console.log('[drone] --- deck params ---');
    for (const [name, entry] of entries) {
      if (name.startsWith('deck.')) console.log(`[drone] ${name} (id ${entry.id})`);
    }
    console.log('[drone] --- end deck params ---');
    console.log('[drone] total params in map:', entries.size);
  };

  // Truncated-name repair now happens upstream in parseParamItem (via
  // repairParamName), so params is keyed by the repaired name and a plain
  // lookup is sufficient. Kept as findParam so callers don't need to change.
  // Reads paramsRef, not the params state — see the comment on paramsRef.
  const findParam = (name: string): ParamEntry | undefined => {
    return paramsRef.current.get(name);
  };

  const setParam = async (fullName: string, value: number, typeOverride?: ParamType) => {
    const entry = findParam(fullName);
    if (!entry) {
      throw new Error(`Unknown parameter "${fullName}" — has the parameter TOC finished loading?`);
    }
    sendPacket(paramWritePacket(entry.id, value, typeOverride ?? entry.type));
  };

  // Resolves to the value, or null on timeout/parse failure — never throws,
  // so a single missing/slow variable can't abort the whole polling cycle.
  const readTeleParam = async (entry: ParamEntry): Promise<number | null> => {
    try {
      const pkt = await request(
        paramReadPacket(entry.id),
        (p) =>
          crtpPort(p[0]) === PORT_PARAM &&
          crtpChannel(p[0]) === PARAM_CHAN_READ &&
          (p[1] | (p[2] << 8)) === entry.id,
        TELE_READ_TIMEOUT_MS
      );
      const parsed = parseParamValue(pkt, entry.type);
      return parsed ? parsed.value : null;
    } catch {
      return null;
    }
  };

  /**
   * Begin recording one sample per second from the live stream.
   * Starting again while already recording restarts cleanly rather than
   * appending to the previous flight.
   */
  const startFlightRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordSamplesRef.current = [];
    setIsRecording(true);
    console.log('[flight] recording started');

    recordTimerRef.current = setInterval(() => {
      const g = (n: string) => logValuesRef.current.get(n) ?? 0;
      recordSamplesRef.current.push({
        x: g('tele.x'),
        y: g('tele.y'),
        z: g('tele.z'),
        front: g('tele.front'),
        back: g('tele.back'),
        left: g('tele.left'),
        right: g('tele.right'),
        up: g('tele.up'),
        down: g('tele.down'),
        yaw: g('tele.yaw'),
      });
    }, 1000);
  };

  /**
   * Stop and save. Returns the sample count, or 0 if there was nothing worth
   * keeping -- a flight of one or two samples is a mis-fire, not a flight, and
   * saving it would just leave junk cards to delete.
   */
  const stopFlightRecording = async (name: string): Promise<number> => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);

    const samples = recordSamplesRef.current;
    recordSamplesRef.current = [];
    if (samples.length < 3) {
      console.warn(`[flight] only ${samples.length} samples, not saving`);
      return 0;
    }

    // Refuse a recording of a flight that did not happen.
    //
    // The recorder runs for a fixed window from the moment START is pressed.
    // It does not know whether the drone ever left the ground, so it saved
    // "Flight 13:16:35" as 19 perfectly ordinary-looking samples during a
    // window that contains no takeoff at all -- the drone sat on the pad the
    // whole time. Three of six flights in that session were this, and they are
    // exactly the cards reading 0.00m that made one repeated hover draw four
    // different 3D paths.
    //
    // An all-zero check was not enough: a drone on the pad still reports its
    // walls (f=275 b=214), so those samples are not zero, just meaningless.
    // Altitude is the honest test. A real flight climbs to roughly 500mm; a
    // drone on the ground reads single-digit millimetres however long you
    // watch it.
    const peakMm = Math.max(...samples.map((p) => p.z));
    if (peakMm < 100) {
      console.error(
        `[flight] discarding "${name}": peak altitude was ${peakMm}mm, so the drone ` +
        'never left the ground during this recording. Either it did not take off, or ' +
        'it flew outside the recording window. Nothing worth keeping either way.'
      );
      return 0;
    }

    const flight = buildFlight(samples, name);
    const ok = await saveFlight(flight);
    console.log(`[flight] ${ok ? 'saved' : 'FAILED to save'} "${name}", ${samples.length} samples`);
    return ok ? samples.length : 0;
  };

  /**
   * Asks the drone for the flight it recorded, and saves it.
   *
   * Returns the number of samples saved, or 0 if nothing usable arrived.
   *
   * The drone's memory is deliberately NOT cleared here. If clearing were
   * automatic and the save then failed, the flight would be gone with no way
   * to ask again -- the drone is the only copy until this succeeds. Clearing
   * is a separate, explicit call.
   */
  const downloadFlightFromDrone = async (name: string): Promise<number> => {
    if (!deviceRef.current) {
      console.warn('[download] not connected');
      return 0;
    }

    // Free the link before asking. This is what was actually broken.
    //
    // Three log blocks stream continuously at 200ms/200ms/1000ms over a BLE
    // link carrying 20 bytes a packet. The download reply queues behind all of
    // it, and after a flight the drone could not get a word in for more than
    // three seconds -- so the app gave up, tore down the collector, and the 11
    // samples that arrived a moment later were dropped on the floor. The drone
    // was never at fault: the log showed "sending 11 samples" printed AFTER
    // "no packet for 3s, stopping with 0 samples".
    //
    // Stopping a block is NOT deleting it. The definition stays on the drone,
    // so this is a plain STOP/START pair that never goes near the create path
    // that fragments and corrupts.
    // Full-speed pumping for the duration. Pausing the log blocks frees the
    // drone's side of the link; this frees ours. Doing only the first, as the
    // previous version did, quietened the link and then left nothing running
    // fast enough to empty it.
    downloadActiveRef.current = true;

    const paused = Array.from(logBlocksRef.current.keys());
    for (const id of paused) sendPacket(logStopBlockPacket(id));
    if (paused.length > 0) {
      console.log(`[download] paused log blocks ${paused.join(', ')} to free the link`);
      // Let what is already queued drain, or the reply just queues behind it.
      await new Promise((r) => setTimeout(r, 400));
    }

    // Resuming is not the same as having resumed.
    //
    // A START that the drone never acts on leaves telemetry silently dead, and
    // the next flight is then recorded as a drone that never left the ground:
    // "peak altitude was 5mm" for a flight the drone itself logged as "peak 562
    // of 500 mm". Sending the command and hoping is what made three flights in
    // a row unrecordable.
    //
    // So check that data is actually flowing again, and if it is not, rebuild
    // the blocks outright -- which is known to work, because the ENOENT
    // recovery does exactly that and its downloads succeed.
    const resumeLogBlocks = () => {
      if (paused.length === 0) return;
      for (const id of paused) {
        const period = logPeriodsRef.current.get(id);
        if (period === undefined) continue;
        sendPacket(logStartBlockPacket(id, period));
      }
      console.log(`[download] resumed log blocks ${paused.join(', ')}`);

      const resumedAt = Date.now();
      setTimeout(() => {
        if (lastLogDataAtRef.current >= resumedAt) return;   // flowing again
        rebuildLogBlocks(paused, 'telemetry did not restart after the download');
      }, 2500);
    };

    // One request often is not enough, and that is not the user's job to know.
    //
    // In the 13:41 session the first two attempts after a flight timed out and
    // the third succeeded, with nothing changed in between; the same pattern
    // repeated later the same session. The drone is not refusing -- its replies
    // simply do not make it back in time on the first ask. Making a person
    // press the button three times to find that out is a bug in the app.
    const attemptTransfer = async (): Promise<BulkSample[]> => {
      const samples: BulkSample[] = [];
      let finished = false;

      // Two different waits, because they are two different questions. Getting
      // the drone to START answering can take seconds; once it is answering,
      // packets come about 5ms apart. A single budget is either too impatient
      // to begin or too slow to notice a transfer that died halfway.
      const FIRST_PACKET_MS = 8000;
      const BETWEEN_PACKETS_MS = 3000;

      await new Promise<void>((resolve) => {
        let idleTimer: ReturnType<typeof setTimeout>;

        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(idleTimer);
          bulkCollectorRef.current = null;
          resolve();
        };

        const bump = (ms: number) => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(finish, ms);
        };

        bulkCollectorRef.current = {
          onSample: (smp) => { samples.push(smp); bump(BETWEEN_PACKETS_MS); },
          onDone: (count) => {
            if (count !== samples.length) {
              console.warn(
                `[download] drone said ${count} samples, ${samples.length} arrived — ` +
                'some packets were lost in transit'
              );
            }
            finish();
          },
        };
        bump(FIRST_PACKET_MS);
      });

      return samples;
    };

    let samples: BulkSample[] = [];
    const ATTEMPTS = 3;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      console.log(
        `[download] requesting the flight from the drone (attempt ${attempt} of ${ATTEMPTS})`
      );
      sendPacket(bulkDumpPacket());
      samples = await attemptTransfer();
      if (samples.length > 0) break;
      if (attempt < ATTEMPTS) {
        console.warn(`[download] attempt ${attempt} brought back nothing — asking again`);
        // A beat before re-asking. Piling a second request straight onto a link
        // that just failed to answer the first only makes the queue longer.
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const count = samples.length;

    // Telemetry comes back whatever happened -- a failed download must not
    // leave the battery and range displays dead until the next reconnect.
    downloadActiveRef.current = false;
    resumeLogBlocks();

    if (count < 3) {
      console.warn(`[download] only ${count} samples, not saving`);
      return 0;
    }

    // Order by the drone's own index, not arrival order. BLE does not
    // guarantee ordering, and one swapped pair would put a kink in the path.
    samples.sort((a, b) => a.index - b.index);

    const flight = buildFlight(
      samples.map((s) => ({
        x: s.x, y: s.y, z: s.z,
        front: s.front, back: s.back, left: s.left, right: s.right,
        up: s.up, down: s.down, yaw: s.yaw,
      })),
      name
    );
    const ok = await saveFlight(flight);
    console.log(`[download] ${ok ? 'saved' : 'FAILED to save'} "${name}", ${count} samples`);
    return ok ? count : 0;
  };

  /** Tells the drone to discard its recording. Only once a download is safely saved. */
  const clearDroneRecording = () => {
    console.log('[download] clearing the drone recording');
    sendPacket(bulkClearPacket());
  };

  const runTelemetryCycle = async () => {
    if (!teleActiveRef.current) return;

    const next = new Map(teleValuesRef.current);
    let changed = false;

    for (const name of TELE_PARAM_NAMES) {
      if (!teleActiveRef.current) return;

      const entry = paramsRef.current.get(name);
      if (!entry) continue; // not present on this firmware build — skip

      const value = await readTeleParam(entry);
      if (value !== null) {
        teleTimeoutCountRef.current.set(name, 0);
        next.set(name, value);
        changed = true;
      } else {
        const count = (teleTimeoutCountRef.current.get(name) ?? 0) + 1;
        teleTimeoutCountRef.current.set(name, count);
        if (count > 0 && count % 5 === 0) {
          console.warn(`[drone] telemetry read "${name}" has timed out ${count} times in a row`);
        }
      }
    }

    if (changed) {
      teleValuesRef.current = next;
      setTeleValues(next);
    }

    if (teleActiveRef.current) {
      teleTimerRef.current = setTimeout(runTelemetryCycle, TELE_POLL_INTERVAL_MS);
    }
  };

  const startTelemetryPolling = () => {
    if (teleActiveRef.current) return;
    teleActiveRef.current = true;
    teleTimeoutCountRef.current = new Map();
    console.log(`[drone] telemetry polling started: ${TELE_PARAM_NAMES.join(', ')}`);
    runTelemetryCycle();
  };

  const stopTelemetryPolling = () => {
    teleActiveRef.current = false;
    if (teleTimerRef.current) {
      clearTimeout(teleTimerRef.current);
      teleTimerRef.current = null;
    }
    teleValuesRef.current = new Map();
    setTeleValues(new Map());
  };

  const fetchLogToc = async () => {
    setLogTocProgress({ loaded: 0, total: 0 });

    const infoPacket = await request(
      logGetInfoPacket(),
      (pkt) => crtpPort(pkt[0]) === PORT_LOG && crtpChannel(pkt[0]) === LOG_CHAN_TOC && pkt[1] === LOG_CMD_GET_INFO,
      5000
    );
    const info = parseLogInfo(infoPacket);
    if (!info) throw new Error('Failed to parse log TOC info');

    const { count, crc } = info;

    const cachedLogs = await loadToc<LogEntry>('log', count, crc);
    if (cachedLogs) {
      console.log(`[drone] log TOC from cache: ${cachedLogs.size} entries (skipped ${count} round trips)`);
      logVarsRef.current = cachedLogs;
      setLogVars(cachedLogs);
      setLogTocProgress({ loaded: count, total: count });
      return;
    }

    console.log(`[drone] log TOC not cached, fetching ${count} entries — this is slow, but only once per firmware build`);
    setLogTocProgress({ loaded: 0, total: count });

    const entries = new Map<string, LogEntry>();
    let logTimeouts = 0;
    for (let id = 0; id < count; id++) {
      let itemPacket: Uint8Array | undefined;
      try {
        itemPacket = await request(
          logGetItemPacket(id),
          (pkt) => crtpPort(pkt[0]) === PORT_LOG && crtpChannel(pkt[0]) === LOG_CHAN_TOC && pkt[1] === LOG_CMD_GET_ITEM,
          3000
        );
      } catch {
        logTimeouts += 1;
        console.warn(`[drone] Timed out fetching log TOC entry ${id}, skipping`);
      }
      // Only parse a packet that actually arrived — a timed-out request must
      // never reach the parser.
      if (itemPacket) {
        const entry = parseLogItem(itemPacket);
        if (entry) entries.set(entry.fullName, entry);
      }
      setLogTocProgress({ loaded: id + 1, total: count });
    }

    await saveToc('log', count, crc, entries, logTimeouts);

    logVarsRef.current = entries;
    setLogVars(entries);
    console.log('[drone] log TOC fetched:', entries.size, 'variables');

    console.log('[drone] --- pm/range log vars ---');
    for (const [name, e] of entries) {
      if (name.startsWith('pm.') || name.startsWith('range.')) {
        console.log(`[drone] ${name} (id ${e.id}, ${e.type})`);
      }
    }
  };

  // Reads logVarsRef, not the logVars state — see the comment on logVarsRef.
  const startLogBlock = (blockId: number, names: string[], periodMs: number) => {
    const entries: LogEntry[] = [];
    for (const name of names) {
      const entry = logVarsRef.current.get(name);
      if (!entry) {
        console.warn(`[drone] Unknown log variable "${name}" — skipping`);
        continue;
      }
      entries.push(entry);
    }

    if (entries.length === 0) {
      console.error(`[drone] No known variables for block ${blockId} — not starting`);
      return;
    }

    // A block over LOG_BLOCK_MAX_BYTES is rejected by the firmware outright,
    // and nothing streams at all — no partial data, no error the user ever
    // sees. That is exactly how the battery display silently never worked:
    // the block asked for 32 bytes against a 26-byte limit. Drop the overflow
    // and say so, so some data still arrives and the cause is obvious.
    let used = 0;
    const fitted: LogEntry[] = [];
    const dropped: string[] = [];
    for (const entry of entries) {
      const size = LOG_TYPE_SIZE[entry.type];
      if (used + size > LOG_BLOCK_MAX_BYTES) {
        dropped.push(entry.fullName);
      } else {
        fitted.push(entry);
        used += size;
      }
    }
    if (dropped.length > 0) {
      console.error(
        `[drone] log block ${blockId} exceeds the ${LOG_BLOCK_MAX_BYTES}-byte CRTP limit. ` +
        `Keeping ${fitted.length} variables (${used} bytes), dropping: ${dropped.join(', ')}. ` +
        'Split them across a second block instead.'
      );
    }
    entries.length = 0;
    entries.push(...fitted);

    // Delete THIS block first. Log blocks live on the drone and survive a
    // disconnect -- only an explicit delete or a reboot clears them -- so an
    // id left over from a session that ended abruptly would otherwise make
    // creation fail.
    //
    // This must be a per-block delete (command 2), never RESET (command 5).
    // While DELETE_BLOCK was wrongly defined as 5, this line erased every
    // block on the drone, so creating block 1 destroyed block 0 and the range
    // sensors were permanently silent while the battery worked.
    sendPacket(logDeleteBlockPacket(blockId));

    logBlocksRef.current.set(blockId, entries);
    logPeriodsRef.current.set(blockId, periodMs);
    blocksSeenRef.current.delete(blockId);
    // A block that is accepted but never delivers is the exact failure we hit
    // with the range sensors: "started log block 0" in the log, then silence.
    setTimeout(() => {
      if (logBlocksRef.current.has(blockId) && !blocksSeenRef.current.has(blockId)) {
        console.error(
          `[drone] log block ${blockId} was started but has sent NO data after 4s. ` +
          `Variables: ${entries.map((e) => e.fullName).join(', ')}`
        );
      }
    }, 4000);
    console.log(`[drone] creating log block ${blockId} with ${entries.length} variables`);
    sendPacket(logCreateBlockPacket(blockId, entries));
    sendPacket(logStartBlockPacket(blockId, periodMs));
    console.log(`[drone] started log block ${blockId} at ${periodMs}ms`);
    console.log(`[drone] block ${blockId} started with: ${entries.map((e) => e.fullName).join(', ')}`);
  };

  const stopLogBlock = (blockId: number) => {
    console.log(`[drone] stopping log block ${blockId}`);
    sendPacket(logStopBlockPacket(blockId));
    sendPacket(logDeleteBlockPacket(blockId));
    logBlocksRef.current.delete(blockId);
    logPeriodsRef.current.delete(blockId);
  };

  // Reads logVarsRef, not the logVars state — see the comment on logVarsRef.
  // For callers (screens) that need to check availability outside a render.
  const hasLogVar = (name: string): boolean => {
    return logVarsRef.current.has(name);
  };

  // Diagnostic probe: fires a fixed sequence of raw CRTP packets at ports/
  // channels/protocol-versions known to Bitcraze firmware, to determine
  // whether the drone answers anything at all over this transport. Never
  // throws — every probe is best-effort and failures are logged, not raised.
  const runCrtpProbe = async () => {
    const device = deviceRef.current;
    if (!device) {
      console.log('[probe] not connected — aborting');
      return;
    }

    const probes: { description: string; packet: Uint8Array }[] = [
      { description: 'Param TOC info, v2 protocol', packet: new Uint8Array([0x2c, 0x03]) },
      { description: 'Param TOC info, v1 protocol', packet: new Uint8Array([0x2c, 0x01]) },
      { description: 'Param TOC item 0, v2', packet: new Uint8Array([0x2c, 0x02, 0x00, 0x00]) },
      { description: 'Param TOC item 0, v1', packet: new Uint8Array([0x2c, 0x00, 0x00, 0x00]) },
      { description: 'Log TOC info, v2', packet: new Uint8Array([0x5c, 0x03]) },
      { description: 'Link echo, port 15 channel 0', packet: new Uint8Array([0xfc, 0x01, 0x02, 0x03]) },
      { description: 'Platform version, port 13 ch 0', packet: new Uint8Array([0xdc, 0x00]) },
      { description: 'Link source (port 15, channel 1)', packet: new Uint8Array([0xfd, 0x00]) },
      { description: 'Safelink enable (port 15, channel 3)', packet: new Uint8Array([0xff, 0x05, 0x01]) },
    ];

    probeRxCountRef.current = 0;
    probeActiveRef.current = true;

    for (let i = 0; i < probes.length; i++) {
      const { description, packet } = probes[i];
      console.log(`[probe ${i + 1}] ${description}, tx = ${toHex(packet)}`);
      sendPacket(packet);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    probeActiveRef.current = false;
    console.log(`[probe] complete, received ${probeRxCountRef.current} notifications total`);
  };

  const cleanupConnection = () => {
    stopPolling();
    stopTelemetryPolling();
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    deviceRef.current = null;
    reassemblerRef.current.reset();
    pidRef.current = 0;

    const pending = pendingRef.current;
    pendingRef.current = [];
    pending.forEach((entry) => entry.reject(new Error('Drone disconnected')));

    setIsConnected(false);
    paramsRef.current = new Map();
    setParams(new Map());
    setTocProgress({ loaded: 0, total: 0 });
    logVarsRef.current = new Map();
    setLogVars(new Map());
    setLogTocProgress({ loaded: 0, total: 0 });
    setLogValues(new Map());
    logValuesRef.current = new Map();
    setSelftestPassed(null);
    logBlocksRef.current = new Map();
    logPeriodsRef.current = new Map();
  };

  const connectToDrone = async (device: Device) => {
    setStatus('connecting');
    try {
      console.log(`Connecting to ${device.name}...`);
      // Ask for the larger MTU as part of connect(). On Android a standalone
      // requestMTU() after connect() often resolves without changing anything
      // -- observed here as "mtu before=23 after=23" with no error thrown.
      //
      // This matters, it is not cosmetic. ATT MTU 23 carries only 20 bytes per
      // notification, but the drone's BLE link sends 21-byte CRTP frames (1
      // control byte + 20 payload). The 21st byte is silently discarded by the
      // radio, so EVERY multi-fragment packet loses exactly one byte at the
      // fragment boundary. That is the cause of the corrupted TOC names
      // ("chargeCurret", "stabilizer.rol") that repairName() exists to patch up.
      let connected = await device.connect({ requestMTU: 185 });
      const mtuBefore = connected.mtu;

      // Retry explicitly after connecting, in case the connect-time request
      // was ignored. Harmless when the MTU is already large.
      if (connected.mtu < 24) {
        try {
          connected = await connected.requestMTU(185);
        } catch (e) {
          console.warn('[ble] requestMTU failed, continuing with default:', e);
        }
      }
      console.log(`[ble] mtu before=${mtuBefore} after=${connected.mtu}`);
      if (connected.mtu < 24) {
        // Expected, and NOT fixable. The Crazyflie's nRF51 runs SoftDevice
        // s130, a Bluetooth 4.1 stack that supports ATT_MTU 23 and nothing
        // larger -- there is no bigger value to negotiate. Multi-fragment
        // packets therefore lose one byte at each fragment boundary over BLE,
        // which is why TOC names arrive corrupted and repairName() exists.
        // The same drone over the Crazyradio has no such problem.
        //
        // Do not "fix" this by requesting a larger MTU again; it has been
        // tried both at connect() and after, and the stack cannot grant it.
        console.log(
          `[ble] MTU ${connected.mtu} (nRF51/s130 maximum). Long names will arrive ` +
          'corrupted and be repaired by name; IDs are unaffected.'
        );
      }

      console.log('✅ Connected! Discovering services...');
      await connected.discoverAllServicesAndCharacteristics();

      if (CRTP_DEBUG) {
        const services = await connected.services();
        for (const service of services) {
          console.log(`[ble service] ${service.uuid}`);
          const characteristics = await service.characteristics();
          for (const characteristic of characteristics) {
            console.log(
              `[ble char] ${service.uuid} / ${characteristic.uuid} isNotifiable=${characteristic.isNotifiable} isWritableWithoutResponse=${characteristic.isWritableWithoutResponse}`
            );
          }
        }
      }

      deviceRef.current = connected;
      reassemblerRef.current.reset();

      subscriptionRef.current = connected.monitorCharacteristicForService(
        CRAZYFLIE_SERVICE,
        CRAZYFLIE_CRTP_DOWN,
        (error, characteristic) => {
          if (error) {
            if (CRTP_DEBUG) console.log(`[crtp rx ERROR] ${error.message}`);
            console.error('[drone] Notification error:', error);
            setStatus('error', `Notification error: ${error.message}`);
            return;
          }

          const frame = base64ToBytes(characteristic?.value ?? '');
          if (CRTP_DEBUG) console.log(`[crtp rx notif] byteLength=${frame.length} bytes=${toHex(frame)}`);
          if (CRTP_DEBUG) console.log(`[crtp rx raw] ${toHex(frame)}`);
          if (probeActiveRef.current) probeRxCountRef.current += 1;

          if (!characteristic?.value) return;

          const packet = reassemblerRef.current.push(frame);
          if (CRTP_DEBUG && packet && crtpPort(packet[0]) === PORT_LOG) {
            console.log(`[log rx] port=5 channel=${crtpChannel(packet[0])} bytes=${toHex(packet)}`);
          }
          if (packet) handlePacket(packet);
        }
      );

      if (CRTP_DEBUG) console.log('[crtp] subscribed to CRTP_DOWN (0204) notifications');

      connected.onDisconnected((_error, disconnectedDevice) => {
        console.log(`⚠️ Drone Disconnected: ${disconnectedDevice?.name}`);
        cleanupConnection();
        setStatus('error', 'Drone disconnected unexpectedly.');
      });

      setIsConnected(true);
      setStatus('connected');
      startPolling();
      console.log('🚀 DRONE IS FULLY CONNECTED AND READY!');

      setStatus('fetching-toc');
// Retry rather than give up.
//
// Whatever makes the first fetch fail -- a boot log that arrived late, a
// congested link, a slow moment -- is transient, and the proof is that
// pressing SCAN again has always worked. Doing that automatically is the
// difference between a drone that is awkward to connect to and one that just
// connects.
withTocRetry(() => fetchParamToc().then(() => fetchLogToc()))
  .then(() => {
    setTimeout(() => {
      // pm.vbat is the stock battery variable and exists on any firmware.
      // tele.vbat and tele.canfly come from cavebat.c; they are listed here
      // because app/index.tsx reads battery from logValues.get('tele.vbat').
      // Before this the block registered only pm./range.* names, so that
      // lookup never resolved and Battery sat on "waiting for data" forever.
      // startLogBlock skips names the connected firmware does not publish,
      // so listing both schemes stays safe on stock firmware.
      // TWO blocks of FIVE. Five is a hard ceiling, not a preference: a block
      // create packet is 3 + 3*N bytes, so five is 18 bytes and fits one
      // 20-byte BLE notification. Six is 21 bytes, gets split across two
      // notifications, and split packets arrive corrupted -- the drone then
      // echoes back a command that was never sent.
      //
      // They are also STAGGERED. Setting both up back to back put four
      // fragments in flight at once; they interleaved and whichever block lost
      // the race was silently destroyed.
      //
      // Block 0: position and the two ranges the flight path needs most.
      startLogBlock(0, [
        'tele.x',
        'tele.y',
        'tele.z',
        'tele.front',
        'tele.back'
      ], 200);

      // Block 1: the remaining side ranges plus UP and DOWN. All six range
      // directions are now recorded, so a flight captures the space around the
      // drone rather than only its horizontal neighbours.
      setTimeout(() => {
        startLogBlock(1, [
          'tele.left',
          'tele.right',
          'tele.up',
          'tele.down',
          'tele.vbat'
        ], 200);
      }, 1500);

      // Block 2: the two pre-flight flags. Slower -- neither changes fast, and
      // it keeps the link quiet during a flight.
      setTimeout(() => {
        startLogBlock(2, [
          'tele.canfly',
          'tele.clear',
          // How many samples the drone is holding. Lets the app say whether
          // there is anything to download instead of running a transfer that
          // returns nothing. Absent on firmware without onboard recording, and
          // startLogBlock skips names the drone does not publish.
          'tele.samples',
          // The heading, so a phone-side recording can place its wall readings
          // as accurately as the drone's own copy. Four variables and 6 bytes,
          // comfortably inside both the five-variable and 26-byte limits.
          'tele.yaw'
        ], 1000);
      }, 3000);
    }, 500);

    if (TELE_POLLING_ENABLED) startTelemetryPolling();
  })
.then(() => setStatus('connected'))
        .catch((error) => {
          console.error('[drone] Failed to fetch parameter/log TOC:', error);
          setStatus('error', `Failed to read parameter list: ${error instanceof Error ? error.message : String(error)}`);
        });
    } catch (error) {
      console.error('❌ Connection failed:', error);
      setStatus('error', `Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const disconnectFromDrone = async () => {
    const device = deviceRef.current;
    if (!device) {
      console.log('No device is currently connected to disconnect from.');
      return;
    }

    console.log(`Disconnecting from ${device.name}...`);
    // Best-effort — the queue is about to be cleared by cleanupConnection, so
    // this may not actually reach the drone, but it's cheap to try.
    stopLogBlock(0);
    // Update the UI immediately so the user isn't left hanging.
    cleanupConnection();
    setStatus('idle');

    try {
      await device.cancelConnection();
      console.log('✅ Successfully disconnected.');
    } catch (error) {
      console.error('❌ Error while disconnecting:', error);
      setStatus('error', `Error while disconnecting: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const scanForDrone = async () => {
    console.log('--- SCAN BUTTON PRESSED ---');
    const manager = getBleManager();
    if (!manager) {
      setStatus('error', 'Bluetooth not available on this device (emulator?)');
      return;
    }

    setStatus('requesting-permission');
    const permission = await requestAndroidPermissions();
    if (!permission.ok) {
      setStatus(
        'permission-denied',
        `${permission.deniedPermission} permission was refused. Enable it in system settings to scan for the drone.`
      );
      return;
    }
    console.log('✅ Permissions granted.');

    const adapterState = await manager.state();
    if (adapterState !== State.PoweredOn) {
      setStatus('bluetooth-off', `Bluetooth is ${adapterState}. Turn on Bluetooth to scan for the drone.`);
      return;
    }

    setStatus('scanning');
    console.log('📡 Starting BLE scan...');

    const stopScan = () => {
      manager.stopDeviceScan();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('[drone] Scan error:', error);
        stopScan();
        setStatus('error', `Scan failed: ${error.message}`);
        return;
      }

      const droneName = device?.name || device?.localName;
      if (droneName && droneName.includes('Crazyflie')) {
        console.log(`🎉 FOUND THE DRONE! Name: ${droneName}`);
        setStatus('found');
        stopScan();
        connectToDrone(device);
      }
    });

    scanTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ Scan timed out after 10s — no Crazyflie found.');
      stopScan();
      setStatus('error', 'No Crazyflie found. Check the drone is powered on and within range.');
    }, SCAN_TIMEOUT_MS);
  };

  return (
    <DroneContext.Provider
      value={{
        isConnected,
        connectedDevice: deviceRef.current,
        params,
        tocProgress,
        bleAvailable: getBleManager() !== null,
        bleStatus,
        bleError,
        scanForDrone,
        disconnectFromDrone,
        setParam,
        findParam,
        runCrtpProbe,
        logVars,
        logTocProgress,
        logValues,
        selftestPassed,
        isRecording,
        startFlightRecording,
        stopFlightRecording,
        downloadFlightFromDrone,
        clearDroneRecording,
        startLogBlock,
        stopLogBlock,
        hasLogVar,
        teleValues,
      }}
    >
      {children}
    </DroneContext.Provider>
  );
}

export function useDroneConnection() {
  const context = useContext(DroneContext);
  if (!context) throw new Error('useDroneConnection must be used within DroneConnectionProvider');
  return context;
}
