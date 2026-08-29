// services/CrtpService.ts
// CRTP protocol encoding/decoding for the Crazyflie over BLE.
// No Bluetooth code lives here on purpose — this is pure byte manipulation.

// ---------- CRTP ports ----------
export const PORT_CONSOLE = 0;
export const PORT_PARAM = 2;
export const PORT_COMMANDER = 3;
export const PORT_MEM = 4;
export const PORT_LOG = 5;

// ---------- Param subsystem channels ----------
export const PARAM_CHAN_TOC = 0;
export const PARAM_CHAN_READ = 1;
export const PARAM_CHAN_WRITE = 2;

// TOC commands (protocol "v2", what current firmware uses)
export const PARAM_CMD_GET_ITEM = 2;
export const PARAM_CMD_GET_INFO = 3;

export type ParamType =
  | "uint8"
  | "uint16"
  | "uint32"
  | "int8"
  | "int16"
  | "int32"
  | "float";

// ---------- base64 (react-native-ble-plx speaks base64, not bytes) ----------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 0x3f] : "=";
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let p = 0,
    buf = 0,
    bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, p);
}

// ---------- CRTP header ----------
// Layout: [ port:4 | link:2 | channel:2 ]. The official client always sets the
// link bits to 3; the firmware masks them off, so we match the official client.
export function crtpHeader(port: number, channel: number): number {
  return ((port & 0x0f) << 4) | (3 << 2) | (channel & 0x03);
}

export function crtpPort(header: number): number {
  return (header >> 4) & 0x0f;
}

export function crtpChannel(header: number): number {
  return header & 0x03;
}

// ---------- BLE fragmentation (CRTPUP / CRTPDOWN control byte) ----------
// Control byte: bit 7 = Start, bits 5-6 = PID, bits 0-4 = Length.
// A BLE write carries the control byte + up to 19 bytes of CRTP packet.
export function fragmentForBle(packet: Uint8Array, pid: number): Uint8Array[] {
  const frames: Uint8Array[] = [];
  const headLen = Math.min(19, packet.length);

  const ctrl = 0x80 | ((pid & 0x03) << 5) | ((packet.length - 1) & 0x1f);
  const first = new Uint8Array(1 + headLen);
  first[0] = ctrl;
  first.set(packet.subarray(0, headLen), 1);
  frames.push(first);

  if (packet.length > 19) {
    const rest = packet.subarray(19);
    const second = new Uint8Array(1 + rest.length);
    second[0] = (pid & 0x03) << 5; // Start = 0, Length = 0
    second.set(rest, 1);
    frames.push(second);
  }
  return frames;
}

// Diagnostics only — temporary, verbose hex logging for CrtpReassembler.push.
// Off by default. These fire on EVERY BLE notification for the whole life of
// the connection and build a hex string each time. Left on, they generate tens
// of thousands of console lines within minutes, which starves the JS thread
// badly enough to miss real replies inside their timeout window.
const REASM_DEBUG = false;
const reasmHex = (bytes: Uint8Array | number[]): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");

// Rebuilds whole CRTP packets from the fragments arriving on CRTPDOWN.
// Control byte: bits 5-6 = pid, bits 0-4 = total CRTP packet length.
//
// The drone's downlink framing does NOT clear the start bit (bit 7) on
// continuation frames — a continuation's control byte can be bit-for-bit
// identical to the frame that opened it. So completion is driven entirely by
// buffer state (do we have an open buffer, does this frame's pid match it),
// never by re-reading a "start" bit.
export class CrtpReassembler {
  private buf: number[] = [];
  private bufferedPid = -1;
  private bufferedLength = 0; // 0 means "no buffer open"

  push(frame: Uint8Array): Uint8Array | null {
    if (frame.length === 0) return null;
    const ctrl = frame[0];
    const length = ctrl & 0x1f;
    const pid = (ctrl & 0x60) >> 5;
    const payload = frame.subarray(1);

    if (this.bufferedLength > 0 && pid === this.bufferedPid) {
      // Continuation of an already-open buffer.
      if (REASM_DEBUG) console.log(
        `[reasm cont] ctrl=0x${ctrl.toString(16).padStart(2, "0")} pid=${pid} bufBefore=${this.buf.length} contPayloadLen=${payload.length} contBytes=${reasmHex(payload)}`,
      );
      this.buf = this.buf.concat(Array.from(payload));
      if (REASM_DEBUG) console.log(`[reasm cont] bufAfter=${reasmHex(this.buf)}`);
      if (this.buf.length >= this.bufferedLength) {
        const done = new Uint8Array(this.buf.slice(0, this.bufferedLength));
        if (REASM_DEBUG) console.log(
          `[crtp reasm] completed pid=${pid} total=${this.bufferedLength}`,
        );
        if (REASM_DEBUG) console.log(
          `[reasm deliver] len=${done.length} bytes=${reasmHex(done)}`,
        );
        this.buf = [];
        this.bufferedPid = -1;
        this.bufferedLength = 0;
        return done;
      }
      return null;
    }

    // No open buffer, or pid differs — this is the start of a new packet.
    this.buf = [];
    this.bufferedPid = -1;
    this.bufferedLength = 0;

    if (payload.length >= length) {
      // The whole packet fit in this one notification.
      const done = new Uint8Array(payload.slice(0, length));
      if (REASM_DEBUG) console.log(`[reasm deliver] len=${done.length} bytes=${reasmHex(done)}`);
      return done;
    }

    this.buf = Array.from(payload);
    this.bufferedPid = pid;
    this.bufferedLength = length;
    if (REASM_DEBUG) console.log(
      `[crtp reasm] opened pid=${pid} expected=${length} got=${payload.length}`,
    );
    if (REASM_DEBUG) console.log(
      `[reasm open] ctrl=0x${ctrl.toString(16).padStart(2, "0")} field=${length} payloadLen=${payload.length} bytes=${reasmHex(payload)}`,
    );
    return null;
  }

  reset() {
    this.buf = [];
    this.bufferedPid = -1;
    this.bufferedLength = 0;
  }
}

// ---------- Parameter TOC ----------
export interface ParamEntry {
  id: number;
  group: string;
  name: string;
  fullName: string; // "mission.state"
  type: ParamType;
  readOnly: boolean;
}

// Type byte encoding from the firmware's param.h:
//   bits 0-1 = size, bit 2 = float flag, bit 3 = unsigned flag, 0x40 = read-only.
const TYPE_TABLE: Record<number, ParamType> = {
  0x00: "int8",
  0x01: "int16",
  0x02: "int32",
  0x06: "float",
  0x08: "uint8",
  0x09: "uint16",
  0x0a: "uint32",
};

export function decodeParamType(typeByte: number): ParamType {
  return TYPE_TABLE[typeByte & 0x0f] ?? "uint8";
}

const PARAM_TYPE_SIZE: Record<ParamType, number> = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  float: 4,
};

export function paramGetInfoPacket(): Uint8Array {
  return new Uint8Array([
    crtpHeader(PORT_PARAM, PARAM_CHAN_TOC),
    PARAM_CMD_GET_INFO,
  ]);
}

export function paramGetItemPacket(id: number): Uint8Array {
  return new Uint8Array([
    crtpHeader(PORT_PARAM, PARAM_CHAN_TOC),
    PARAM_CMD_GET_ITEM,
    id & 0xff,
    (id >> 8) & 0xff,
  ]);
}

export function parseParamInfo(
  pkt: Uint8Array,
): { count: number; crc: number } | null {
  if (pkt.length < 8) return null;
  if (crtpPort(pkt[0]) !== PORT_PARAM || pkt[1] !== PARAM_CMD_GET_INFO)
    return null;
  const count = pkt[2] | (pkt[3] << 8);
  const crc = (pkt[4] | (pkt[5] << 8) | (pkt[6] << 16) | (pkt[7] << 24)) >>> 0;
  return { count, crc };
}

// Parameter names longer than ~13 characters are missing their last byte —
// the BLE connection is capped at a 20-byte notification MTU regardless of
// requestMTU, so a name needing 21 bytes loses its final character. When the
// lost byte was the NUL terminator, the next byte in the packet gets absorbed
// into the name instead (e.g. "mission.height" -> "mission.heighte").
const KNOWN_PARAM_NAMES = [
  "deck.bcFlow2",
  "deck.bcMultiranger",
  "deck.bcZRanger",
  "deck.bcZRanger2",
  "deck.bcLedRing",
  "deck.bcBuzzer",
  "deck.bcOA",
  "deck.bcLighthouse4",
  "deck.bcUSD",
  "deck.bcDWM1000",
  "deck.bcAI",
  "mission.state",
  "mission.timer",
  "mission.height",
  "mission.maxtime",
  "mission.sampledist",
  "mission.vbatmin",
];

// True if `short` is `full` with exactly one character removed, anywhere.
function isOneDeletion(short: string, full: string): boolean {
  if (short.length !== full.length - 1) return false;
  let i = 0;
  while (i < short.length && short[i] === full[i]) i++;
  return short.slice(i) === full.slice(i + 1);
}

// Shared by parseParamItem and parseLogItem — both suffer the same BLE
// fragment-boundary truncation, just against different name tables.
function repairName(raw: string, knownNames: string[]): string {
  if (knownNames.includes(raw)) return raw;

  const candidates = knownNames.filter(
    (known) =>
      // one byte lost at the fragment boundary, anywhere in the name
      isOneDeletion(raw, known) ||
      // NUL terminator lost, so a stray byte got absorbed onto the end
      (raw.length === known.length + 1 && raw.startsWith(known)),
  );

  if (candidates.length === 1) {
    console.warn(`[crtp] repaired "${raw}" -> "${candidates[0]}"`);
    return candidates[0];
  }
  return raw;
}

export function repairParamName(raw: string): string {
  return repairName(raw, KNOWN_PARAM_NAMES);
}

export function parseParamItem(pkt: Uint8Array): ParamEntry | null {
  // [header][cmd][id_lo][id_hi][type][group\0][name\0]
  if (pkt.length < 6) return null;
  if (crtpPort(pkt[0]) !== PORT_PARAM || pkt[1] !== PARAM_CMD_GET_ITEM)
    return null;

  const id = pkt[2] | (pkt[3] << 8);
  const typeByte = pkt[4];

  const strings: string[] = [];
  let current = "";
  for (let i = 5; i < pkt.length; i++) {
    if (pkt[i] === 0) {
      strings.push(current);
      current = "";
    } else {
      current += String.fromCharCode(pkt[i]);
    }
  }
  // The final string is terminated by the end of the packet, not necessarily
  // by a NUL byte — a name that exactly fills the last BLE fragment has no
  // room left for a trailing NUL.
  if (current.length > 0) strings.push(current);
  if (strings.length < 2) return null;

  const rawFullName = `${strings[0]}.${strings[1]}`;
  const fullName = repairParamName(rawFullName);
  const dot = fullName.indexOf(".");
  const group = dot >= 0 ? fullName.slice(0, dot) : fullName;
  const name = dot >= 0 ? fullName.slice(dot + 1) : "";

  return {
    id,
    group,
    name,
    fullName,
    type: decodeParamType(typeByte),
    readOnly: (typeByte & 0x40) !== 0,
  };
}

// ---------- Parameter read ----------
export function paramReadPacket(id: number): Uint8Array {
  return new Uint8Array([
    crtpHeader(PORT_PARAM, PARAM_CHAN_READ),
    id & 0xff,
    (id >> 8) & 0xff,
  ]);
}

export function parseParamValue(
  pkt: Uint8Array,
  type: ParamType,
): { id: number; value: number } | null {
  // [header][id_lo][id_hi][value bytes...]
  if (crtpPort(pkt[0]) !== PORT_PARAM) return null;
  const size = PARAM_TYPE_SIZE[type];
  if (pkt.length < 3 + size) return null;

  const id = pkt[1] | (pkt[2] << 8);
  const dv = new DataView(pkt.buffer, pkt.byteOffset + 3, size);
  let value: number;
  switch (type) {
    case "int8":
      value = dv.getInt8(0);
      break;
    case "uint8":
      value = dv.getUint8(0);
      break;
    case "int16":
      value = dv.getInt16(0, true);
      break;
    case "uint16":
      value = dv.getUint16(0, true);
      break;
    case "int32":
      value = dv.getInt32(0, true);
      break;
    case "uint32":
      value = dv.getUint32(0, true);
      break;
    case "float":
      value = dv.getFloat32(0, true);
      break;
  }
  return { id, value };
}

// ---------- Parameter write ----------
export function encodeValue(value: number, type: ParamType): Uint8Array {
  const buf = new ArrayBuffer(PARAM_TYPE_SIZE[type]);
  const dv = new DataView(buf);
  switch (type) {
    case "int8":
      dv.setInt8(0, value);
      break;
    case "uint8":
      dv.setUint8(0, value);
      break;
    case "int16":
      dv.setInt16(0, value, true);
      break;
    case "uint16":
      dv.setUint16(0, value, true);
      break;
    case "int32":
      dv.setInt32(0, value, true);
      break;
    case "uint32":
      dv.setUint32(0, value, true);
      break;
    case "float":
      dv.setFloat32(0, value, true);
      break;
  }
  return new Uint8Array(buf);
}

export function paramWritePacket(
  id: number,
  value: number,
  type: ParamType,
): Uint8Array {
  const val = encodeValue(value, type);
  const out = new Uint8Array(3 + val.length);
  out[0] = crtpHeader(PORT_PARAM, PARAM_CHAN_WRITE);
  out[1] = id & 0xff;
  out[2] = (id >> 8) & 0xff;
  out.set(val, 3);
  return out;
}

// ---------- Log subsystem ----------
export const LOG_CHAN_TOC = 0;
export const LOG_CHAN_CTRL = 1;
export const LOG_CHAN_DATA = 2;

export const LOG_CMD_GET_ITEM = 2;
export const LOG_CMD_GET_INFO = 3;

export const LOG_CTRL_CREATE_BLOCK = 6; // v2
export const LOG_CTRL_START_BLOCK = 3;
export const LOG_CTRL_STOP_BLOCK = 4;
export const LOG_CTRL_DELETE_BLOCK = 5;

export type LogType =
  | "uint8"
  | "uint16"
  | "uint32"
  | "int8"
  | "int16"
  | "int32"
  | "float"
  | "fp16";

export interface LogEntry {
  id: number;
  group: string;
  name: string;
  fullName: string;
  type: LogType;
}

// Log type byte encoding from the firmware's log.h — a direct value, not a
// bitfield like the param type byte.
const LOG_TYPE_TABLE: Record<number, LogType> = {
  1: "uint8",
  2: "uint16",
  3: "uint32",
  4: "int8",
  5: "int16",
  6: "int32",
  7: "float",
  8: "fp16",
};

const LOG_TYPE_TO_BYTE: Record<LogType, number> = {
  uint8: 1,
  uint16: 2,
  uint32: 3,
  int8: 4,
  int16: 5,
  int32: 6,
  float: 7,
  fp16: 8,
};

// A Crazyflie log block's packed payload is capped at LOG_MAX_LEN (26) bytes
// in the firmware's log.c. Asking for more makes the drone reject the block
// outright, so NOTHING streams -- not a truncated subset, nothing at all.
// Exported so callers can check before asking rather than failing silently.
export const LOG_BLOCK_MAX_BYTES = 26;

export const LOG_TYPE_SIZE: Record<LogType, number> = {
  uint8: 1,
  int8: 1,
  uint16: 2,
  int16: 2,
  fp16: 2,
  uint32: 4,
  int32: 4,
  float: 4,
};

export function decodeLogType(typeByte: number): LogType {
  return LOG_TYPE_TABLE[typeByte & 0x0f] ?? "uint8";
}

export function logGetInfoPacket(): Uint8Array {
  return new Uint8Array([crtpHeader(PORT_LOG, LOG_CHAN_TOC), LOG_CMD_GET_INFO]);
}

export function logGetItemPacket(id: number): Uint8Array {
  return new Uint8Array([
    crtpHeader(PORT_LOG, LOG_CHAN_TOC),
    LOG_CMD_GET_ITEM,
    id & 0xff,
    (id >> 8) & 0xff,
  ]);
}

export function parseLogInfo(
  pkt: Uint8Array,
): { count: number; crc: number } | null {
  if (pkt.length < 8) return null;
  if (crtpPort(pkt[0]) !== PORT_LOG || pkt[1] !== LOG_CMD_GET_INFO) return null;
  const count = pkt[2] | (pkt[3] << 8);
  const crc = (pkt[4] | (pkt[5] << 8) | (pkt[6] << 16) | (pkt[7] << 24)) >>> 0;
  return { count, crc };
}

// Same truncation issue as parameter names — names longer than ~13 characters
// lose a byte at the fragment boundary.
const KNOWN_LOG_NAMES = [
  "pm.vbat",
  "pm.vbatMV",
  "pm.batteryLevel",
  "pm.chargeCurrent",
  "pm.state",
  "range.front",
  "range.back",
  "range.left",
  "range.right",
  "range.up",
  "range.zrange",
  "stateEstimate.x",
  "stateEstimate.y",
  "stateEstimate.z",
  "stateEstimate.yaw",
  "stabilizer.roll",
  "stabilizer.pitch",
  "stabilizer.yaw",
];

export function repairLogName(raw: string): string {
  return repairName(raw, KNOWN_LOG_NAMES);
}

export function parseLogItem(pkt: Uint8Array | null | undefined): LogEntry | null {
  // [header][cmd][id_lo][id_hi][type][group\0][name\0]
  if (!pkt || pkt.length < 6) return null;
  if (crtpPort(pkt[0]) !== PORT_LOG || pkt[1] !== LOG_CMD_GET_ITEM) return null;

  const id = pkt[2] | (pkt[3] << 8);
  const typeByte = pkt[4];

  const strings: string[] = [];
  let current = "";
  for (let i = 5; i < pkt.length; i++) {
    if (pkt[i] === 0) {
      strings.push(current);
      current = "";
    } else {
      current += String.fromCharCode(pkt[i]);
    }
  }
  if (current.length > 0) strings.push(current);
  if (strings.length < 2) return null;

  const rawFullName = `${strings[0]}.${strings[1]}`;
  const fullName = repairLogName(rawFullName);
  const dot = fullName.indexOf(".");
  const group = dot >= 0 ? fullName.slice(0, dot) : fullName;
  const name = dot >= 0 ? fullName.slice(dot + 1) : "";

  return {
    id,
    group,
    name,
    fullName,
    type: decodeLogType(typeByte),
  };
}

// cflib packs BOTH a fetch-as type (low nibble) and a stored-as type (high
// nibble) into this byte — see LogVariable.get_storage_and_fetch_byte() in
// cflib/crazyflie/log.py. We always fetch a variable as its native stored
// type, so both nibbles carry the same value (e.g. float -> 0x77, not 0x07).
function storageAndFetchByte(type: LogType): number {
  const t = LOG_TYPE_TO_BYTE[type] & 0x0f;
  return t | (t << 4);
}

export function logCreateBlockPacket(blockId: number, vars: LogEntry[]): Uint8Array {
  const out = new Uint8Array(3 + vars.length * 3);
  out[0] = crtpHeader(PORT_LOG, LOG_CHAN_CTRL);
  out[1] = LOG_CTRL_CREATE_BLOCK;
  out[2] = blockId & 0xff;
  let offset = 3;
  for (const v of vars) {
    out[offset++] = storageAndFetchByte(v.type);
    out[offset++] = v.id & 0xff;
    out[offset++] = (v.id >> 8) & 0xff;
  }
  return out;
}

export function logStartBlockPacket(blockId: number, periodMs: number): Uint8Array {
  const period = Math.max(1, Math.min(255, Math.round(periodMs / 10)));
  return new Uint8Array([
    crtpHeader(PORT_LOG, LOG_CHAN_CTRL),
    LOG_CTRL_START_BLOCK,
    blockId & 0xff,
    period,
  ]);
}

export function logStopBlockPacket(blockId: number): Uint8Array {
  return new Uint8Array([
    crtpHeader(PORT_LOG, LOG_CHAN_CTRL),
    LOG_CTRL_STOP_BLOCK,
    blockId & 0xff,
  ]);
}

export function logDeleteBlockPacket(blockId: number): Uint8Array {
  return new Uint8Array([
    crtpHeader(PORT_LOG, LOG_CHAN_CTRL),
    LOG_CTRL_DELETE_BLOCK,
    blockId & 0xff,
  ]);
}

// IEEE-754 half-precision -> JS number. Log variables can be stored as fp16
// on the firmware side to save bandwidth.
function decodeFp16(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * fraction * Math.pow(2, -24);
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * (1 + fraction / 1024) * Math.pow(2, exponent - 15);
}

function readLogValue(dv: DataView, offset: number, type: LogType): number {
  switch (type) {
    case "uint8":
      return dv.getUint8(offset);
    case "int8":
      return dv.getInt8(offset);
    case "uint16":
      return dv.getUint16(offset, true);
    case "int16":
      return dv.getInt16(offset, true);
    case "uint32":
      return dv.getUint32(offset, true);
    case "int32":
      return dv.getInt32(offset, true);
    case "float":
      return dv.getFloat32(offset, true);
    case "fp16":
      return decodeFp16(dv.getUint16(offset, true));
  }
}

export function decodeLogData(
  pkt: Uint8Array,
  entries: LogEntry[],
): { blockId: number; timestamp: number; values: number[] } | null {
  // [header][blockId][ts0][ts1][ts2][packed values...]
  if (pkt.length < 5) return null;

  const blockId = pkt[1];
  const timestamp = pkt[2] | (pkt[3] << 8) | (pkt[4] << 16);

  const dv = new DataView(pkt.buffer, pkt.byteOffset + 5, pkt.length - 5);
  const values: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const size = LOG_TYPE_SIZE[entry.type];
    if (offset + size > dv.byteLength) break;
    values.push(readLogValue(dv, offset, entry.type));
    offset += size;
  }

  if (REASM_DEBUG) console.log(`[log decode] block=${blockId} ts=${timestamp} values=${values.join(", ")}`);

  return { blockId, timestamp, values };
}

// ---------- Compatibility shim ----------
// mission.tsx and tuning.tsx still call this. It keeps them compiling.
// We rewrite both screens properly later.
export const CrtpService = {
  writeParameter(id: number, value: number, type: ParamType): string {
    return bytesToBase64(
      fragmentForBle(paramWritePacket(id, value, type), 0)[0],
    );
  },
};
