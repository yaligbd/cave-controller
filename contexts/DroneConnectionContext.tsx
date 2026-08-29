import React, { createContext, useContext, useRef, useState } from 'react';
import { loadToc, saveToc } from '@/services/TocCache';
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
  };

  const PORT_LINKCTRL = 15;

  // Log data streams continuously once a block is running — decode and store
  // it. The per-packet [log data] log below is a TEMPORARY diagnostic added
  // to find why no data was arriving; remove it (or the CRTP_DEBUG-style
  // gating) once confirmed working, it will flood the console otherwise.
  const handleLogData = (packet: Uint8Array) => {
    const blockId = packet[1];
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
          setTimeout(sendNext, POLL_DELAY_MS);
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
    const MAX_WAIT_MS = 10000;
    const start = Date.now();
    while (Date.now() - lastConsolePacketAtRef.current < QUIET_WINDOW_MS) {
      if (Date.now() - start >= MAX_WAIT_MS) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log('[crtp] console quiet, requesting TOC');
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

    logBlocksRef.current.set(blockId, entries);
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
    logBlocksRef.current = new Map();
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
        console.warn(
          `[ble] MTU is ${connected.mtu}; only ${connected.mtu - 3} bytes fit per notification. ` +
          'The drone sends 21-byte frames, so multi-fragment packets will lose one byte each ' +
          'and TOC names will arrive corrupted.'
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
fetchParamToc()
  .then(() => fetchLogToc())
  .then(() => {
    setTimeout(() => {
      // pm.vbat is the stock battery variable and exists on any firmware.
      // tele.vbat and tele.canfly come from cavebat.c; they are listed here
      // because app/index.tsx reads battery from logValues.get('tele.vbat').
      // Before this the block registered only pm./range.* names, so that
      // lookup never resolved and Battery sat on "waiting for data" forever.
      // startLogBlock skips names the connected firmware does not publish,
      // so listing both schemes stays safe on stock firmware.
      // TWO blocks, deliberately. All of this in one block came to 32 bytes
      // against a 26-byte firmware limit, so the drone rejected it and no
      // live data streamed at all — which is why the battery never appeared.
      //
      // Block 0, the six range sensors: 6 floats = 24 bytes.
      startLogBlock(0, [
        'range.front',
        'range.back',
        'range.left',
        'range.right',
        'range.up',
        'range.zrange'
      ], 100);

      // Block 1, battery and mission status: 4 + 2 + 1 + 1 + 2 + 1 = 11 bytes.
      // Slower period; none of it changes fast, and it keeps the link quiet.
      startLogBlock(1, [
        'pm.vbat',
        'tele.vbat',
        'tele.canfly',
        'tele.clear',
        'tele.maxz',
        'tele.endwhy'
      ], 500);
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
