import React, { createContext, useContext, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';

import {
  base64ToBytes,
  bytesToBase64,
  crtpChannel,
  crtpPort,
  CrtpReassembler,
  fragmentForBle,
  PARAM_CHAN_TOC,
  PARAM_CMD_GET_INFO,
  PARAM_CMD_GET_ITEM,
  ParamEntry,
  paramGetInfoPacket,
  paramGetItemPacket,
  ParamType,
  paramWritePacket,
  parseParamInfo,
  parseParamItem,
  PORT_CONSOLE,
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
const CRTP_DEBUG = true;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

const SCAN_TIMEOUT_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 1000;

// The nRF51 BLE bridge only pushes a CRTPDOWN notification in response to a
// CRTPUP/CRTP write — it never sends anything unprompted. To match the
// official iOS client, we keep a continuous poll running: real packets are
// queued and sent in order, and whenever the queue is empty we send a single
// null byte just to keep the bridge flushing its downlink buffer.
const NULL_PACKET = new Uint8Array([0xff]);
const POLL_DELAY_MS = 10;

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
}

const DroneContext = createContext<DroneContextType | null>(null);

export function DroneConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [params, setParams] = useState<Map<string, ParamEntry>>(new Map());
  const [tocProgress, setTocProgress] = useState<TocProgress>({ loaded: 0, total: 0 });
  const [bleStatus, setBleStatus] = useState<BleStatus>('idle');
  const [bleError, setBleError] = useState<string | null>(null);

  // Every stage of the connect flow goes through here so the UI always has
  // something to show — "no visible response" is exactly the bug this exists
  // to prevent.
  const setStatus = (status: BleStatus, error: string | null = null) => {
    console.log(`[drone] status -> ${status}${error ? ` (${error})` : ''}`);
    setBleStatus(status);
    setBleError(error);
  };

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

  // Timestamp of the most recent port-0 (console) packet, used to detect when
  // the drone's post-connect boot log dump has finished. 0 means "none seen".
  const lastConsolePacketAtRef = useRef<number>(0);
  // Diagnostics only — the last packet handlePacket saw, regardless of
  // whether it matched a pending request, so a timeout can show what (if
  // anything) actually arrived.
  const lastPacketSeenRef = useRef<Uint8Array | null>(null);

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

  const handlePacket = (packet: Uint8Array) => {
    lastPacketSeenRef.current = packet;
    if (CRTP_DEBUG) console.log(`[crtp rx packet] ${toHex(packet)}`);
    if (packet.length === 0) return;
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

    writeCrtpBytes(packet, queued === undefined)
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
    sendNext();
  };

  const stopPolling = () => {
    pollingActiveRef.current = false;
    packetQueueRef.current = [];
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

    const { count } = info;
    setTocProgress({ loaded: 0, total: count });

    const entries = new Map<string, ParamEntry>();
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
        console.warn(`[drone] Timed out fetching param TOC entry ${id}, skipping`);
      }
      setTocProgress({ loaded: id + 1, total: count });
    }

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
  const findParam = (name: string): ParamEntry | undefined => {
    return params.get(name);
  };

  const setParam = async (fullName: string, value: number, typeOverride?: ParamType) => {
    const entry = findParam(fullName);
    if (!entry) {
      throw new Error(`Unknown parameter "${fullName}" — has the parameter TOC finished loading?`);
    }
    sendPacket(paramWritePacket(entry.id, value, typeOverride ?? entry.type));
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
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    deviceRef.current = null;
    reassemblerRef.current.reset();
    pidRef.current = 0;

    const pending = pendingRef.current;
    pendingRef.current = [];
    pending.forEach((entry) => entry.reject(new Error('Drone disconnected')));

    setIsConnected(false);
    setParams(new Map());
    setTocProgress({ loaded: 0, total: 0 });
  };

  const connectToDrone = async (device: Device) => {
    setStatus('connecting');
    try {
      console.log(`Connecting to ${device.name}...`);
      let connected = await device.connect();
      const mtuBefore = connected.mtu;

      try {
        connected = await connected.requestMTU(185);
        console.log('[ble] MTU negotiated:', connected.mtu);
      } catch (e) {
        console.warn('[ble] requestMTU failed, continuing with default:', e);
      }
      console.log(`[ble] mtu before=${mtuBefore} after=${connected.mtu}`);

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
        .then(() => setStatus('connected'))
        .catch((error) => {
          console.error('[drone] Failed to fetch parameter TOC:', error);
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
