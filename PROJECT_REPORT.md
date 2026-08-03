# PROJECT_REPORT.md

Read-only audit of the repository as it currently sits on disk (branch `master`, working tree has uncommitted changes — see `git status` in section 6/8). This describes what the code **actually is**, not what it's meant to become.

---

## 1. File inventory

### app/
- `app/_layout.tsx` — root layout. Wraps the app in `ThemeProvider` (light/dark from `@react-navigation/native`) and `DroneConnectionProvider`, renders a headerless `expo-router` `Stack`, and a `StatusBar`.
- `app/history.tsx` — renders `Header` + a scrollable list of `FlightCard`s built from the `demoFlights` fixture. Defines a local `handleCardPress` that is never attached to anything (dead code).
- `app/index.tsx` — "3D Hologram Sandbox" screen. Shows a param-TOC status line, a placeholder box for a future 3D view, and a "Download Last Flight Log" button that fakes a 2.5s BLE download and fills in a hardcoded coordinate array.
- `app/mission.tsx` — pre-flight checklist screen. Writes mission timer/RTH/state over BLE using **hardcoded numeric param IDs** through the `CrtpService.writeParameter` compatibility shim.
- `app/modal.tsx` — default Expo-template modal screen ("This is a modal" + link home). Not linked to from anywhere else in `app/` or `components/`.
- `app/settings.tsx` — form with mission timer / max altitude inputs and 4 checkboxes (Obstacle Avoidance, RTH, DarkMode, Notifications). None of this state is sent over BLE or persisted anywhere. Default export is named `ScreenName`.
- `app/setup.tsx` — "Hardware Setup" / OTA flash screen. Drives `OtaService` through reboot-to-bootloader → read firmware file → chunked upload → reboot-to-firmware.
- `app/tuning.tsx` — "Live PID Tuning" screen. Five +/- steppers, each writing a **hardcoded numeric param ID (4–8)** through the same `CrtpService.writeParameter` shim.

### components/
- `components/Header.tsx` — top nav bar used by every screen: logo link, Mission/Setup/History text links, Tuning/Bluetooth/Settings icon buttons. The Bluetooth icon button calls `scanForDrone`/`disconnectFromDrone` from `useDroneConnection` depending on `isConnected`.
- `components/external-link.tsx` — `ExternalLink`: wraps `expo-router`'s `Link` to open in an in-app browser on native, `target="_blank"` on web. Not imported anywhere under `app/`.
- `components/flightCard.tsx` — `FlightCard`: renders a `Flight` (image, name, maxAltitude, distance, duration, batteryUsage) as a touchable card. Has its own internal tap handler that shows a single-argument `Alert.alert`.
- `components/haptic-tab.tsx` — `HapticTab`: bottom-tab-bar button wrapper adding iOS haptic feedback on press. Unused — the app has no bottom tab navigator; nav is done via `Header`'s `Link`s.
- `components/hello-wave.tsx` — `HelloWave`: animated waving-emoji `Text`, from the default Expo template. Unused.
- `components/parallax-scroll-view.tsx` — `ParallaxScrollView`: default-template parallax-header scroll wrapper. Unused.
- `components/themed-text.tsx` — `ThemedText`: `Text` variant resolving color via `useThemeColor`. Used only by `app/modal.tsx`.
- `components/themed-view.tsx` — `ThemedView`: `View` variant resolving background color via `useThemeColor`. Used only by `app/modal.tsx`.
- `components/ui/collapsible.tsx` — `Collapsible`: expandable section component from the default template. Unused.
- `components/ui/icon-symbol.tsx` — `IconSymbol` (Android/web fallback): maps a small hardcoded name set to `MaterialIcons`. Used only by `collapsible.tsx`.
- `components/ui/icon-symbol.ios.tsx` — `IconSymbol` (iOS): same call signature, backed by native `SymbolView`. Used only by `collapsible.tsx`.

### contexts/
- `contexts/DroneConnectionContext.tsx` — BLE connect/disconnect state, CRTP send/request plumbing, parameter-TOC fetch, `setParam` by name. Instantiated once in `app/_layout.tsx`.

### services/
- `services/CrtpService.ts` — pure byte-level CRTP/BLE encoding: base64 helpers, CRTP header bit-packing, BLE fragmentation/reassembly, param TOC packet build/parse, param value encode/write. No Bluetooth code. Also exports a `CrtpService.writeParameter` compatibility object still consumed by `mission.tsx`/`tuning.tsx`.
- `services/OtaService.ts` — static-method class driving an OTA firmware flash over BLE: reboot-to-bootloader, read a bundled `.c` file as raw bytes via `expo-asset`/`expo-file-system`, chunked CRTP upload, reboot-to-firmware.

### hooks/
- `hooks/use-color-scheme.ts` — re-exports React Native's `useColorScheme` unchanged (native).
- `hooks/use-color-scheme.web.ts` — web variant; returns `'light'` until first client-side hydration (for static rendering), then the real scheme.
- `hooks/use-theme-color.ts` — `useThemeColor`: resolves a color from `Colors[light|dark]`, with per-call `light`/`dark` overrides.

### constants/
- `constants/theme.ts` — `Colors` (light/dark palette), `styles` (one shared `StyleSheet.create` used across most screens/components), `Fonts` (`Platform.select` font stacks).

### data/
- `data/demoFlights.tsx` — `demoFlights: Flight[]`, a 3-entry fixture combining hand-written metadata with the sensor traces from `demoFlightsData.tsx`.
- `data/demoFlightsData.tsx` — `flightData1`, `flightData2`, `flightData3` (individual `FlightData` sensor-trace fixtures) and `demoFlightsData` (a `Record<string, FlightData>` keyed by those variable names).

### types/
- `types/flightT.tsx` — `Flight` and `FlightData` interfaces.

### scripts/
- `scripts/reset-project.js` — the standard Expo `reset-project` CLI script (moves `app`/`components`/`hooks`/`constants`/`scripts` to `app-example` or deletes them, scaffolds a blank `app/`). Unmodified template boilerplate.

### assets/ (folder names + file counts only)
- `assets/firmware/` — 1 file
- `assets/images/` — 12 files

---

## 2. Public API — verbatim

### services/CrtpService.ts

```ts
export const PORT_CONSOLE = 0;
export const PORT_PARAM = 2;
export const PORT_COMMANDER = 3;
export const PORT_MEM = 4;
export const PORT_LOG = 5;

export const PARAM_CHAN_TOC = 0;
export const PARAM_CHAN_READ = 1;
export const PARAM_CHAN_WRITE = 2;

export const PARAM_CMD_GET_ITEM = 2;
export const PARAM_CMD_GET_INFO = 3;

export type ParamType = 'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'int32' | 'float';

export function bytesToBase64(bytes: Uint8Array): string

export function base64ToBytes(s: string): Uint8Array

export function crtpHeader(port: number, channel: number): number

export function crtpPort(header: number): number

export function crtpChannel(header: number): number

export function fragmentForBle(packet: Uint8Array, pid: number): Uint8Array[]

export class CrtpReassembler {
  push(frame: Uint8Array): Uint8Array | null
  reset()
}

export interface ParamEntry {
  id: number;
  group: string;
  name: string;
  fullName: string; // "mission.state"
  type: ParamType;
  readOnly: boolean;
}

export function decodeParamType(typeByte: number): ParamType

export function paramGetInfoPacket(): Uint8Array

export function paramGetItemPacket(id: number): Uint8Array

export function parseParamInfo(pkt: Uint8Array): { count: number; crc: number } | null

export function parseParamItem(pkt: Uint8Array): ParamEntry | null

export function encodeValue(value: number, type: ParamType): Uint8Array

export function paramWritePacket(id: number, value: number, type: ParamType): Uint8Array

// ---------- Compatibility shim ----------
// mission.tsx and tuning.tsx still call this. It keeps them compiling.
// We rewrite both screens properly later.
export const CrtpService = {
  writeParameter(id: number, value: number, type: ParamType): string {
    return bytesToBase64(fragmentForBle(paramWritePacket(id, value, type), 0)[0]);
  },
};
```

Non-exported internals worth noting for completeness: `B64` (base64 alphabet string), `TYPE_TABLE: Record<number, ParamType>`.

### services/OtaService.ts

```ts
export class OtaService {
  static async sendPacket(device: Device, byteArray: number[])

  static async rebootToBootloader(device: Device)

  static async readFirmwareFile(): Promise<Uint8Array>

  static async uploadFirmwareChunks(
    device: Device,
    fwBytes: Uint8Array,
    progressCallback: (p: number) => void,
  )

  static async rebootToFirmware(device: Device)
}
```

That is the only export from the file.

### contexts/DroneConnectionContext.tsx

```ts
export const CRAZYFLIE_SERVICE = '00000201-1c7f-4f9e-947b-43b7c00a9a08';
export const CRAZYFLIE_CRTP = '00000202-1c7f-4f9e-947b-43b7c00a9a08'; // simple, 20-byte limited — unused
export const CRAZYFLIE_CRTP_UP = '00000203-1c7f-4f9e-947b-43b7c00a9a08'; // phone -> drone
export const CRAZYFLIE_CRTP_DOWN = '00000204-1c7f-4f9e-947b-43b7c00a9a08'; // drone -> phone, notify only
export const CRAZYFLIE_RX = CRAZYFLIE_CRTP_UP;

export function DroneConnectionProvider({ children }: { children: React.ReactNode })

export function useDroneConnection()
```

`useDroneConnection()` throws `Error('useDroneConnection must be used within DroneConnectionProvider')` if called outside the provider, otherwise returns the context value below.

Full context value type (`DroneContextType` — declared in the file, not itself exported, but this is the shape `useDroneConnection()` returns):

```ts
interface DroneContextType {
  isConnected: boolean;
  connectedDevice: Device | null;
  params: Map<string, ParamEntry>;
  tocProgress: TocProgress;
  bleAvailable: boolean;
  scanForDrone: () => Promise<void>;
  disconnectFromDrone: () => Promise<void>;
  setParam: (fullName: string, value: number, typeOverride?: ParamType) => Promise<void>;
}
```

where (also declared, not exported):

```ts
interface TocProgress {
  loaded: number;
  total: number;
}
```

### constants/theme.ts

```ts
export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,     // "#0a7ea4"
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,      // "#fff"
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
};

export const styles = StyleSheet.create({ ... });

export const Fonts = Platform.select({
  ios: { sans, serif, rounded, mono },
  default: { sans, serif, rounded, mono },
  web: { sans, serif, rounded, mono },
});
```

Every key present in `styles` (all `export const styles = StyleSheet.create({...})`):

```
safeArea, headerContainer, navOptions, navText, iconButtons, roundButton,
bodyContainer, cardWrapper, cardImage, cardOverlay, cardTitle, cardSubtitle,
container, label, input, checkboxContainer, checkboxLabel
```

(Note: `container` and `label` here duplicate style names also defined locally inside individual screens' own `StyleSheet.create` calls — see section 8.)

### types/flightT.tsx (full file — every type/interface)

```ts
export interface Flight {
    id: number;
    name: string;
    duration: number; // Duration in seconds
    maxAltitude: number; // Max altitude in meters
    distance: number; // Distance in meters
    batteryUsage: number; // Battery usage percentage
    flightPath: FlightData;
    video: string; //encoded image or URL
  }

export interface FlightData{
    frontSensor: number[]; // Array of distance readings from the front sensor
    backSensor: number[]; // Array of distance readings from the back sensor
    leftSensor: number[]; // Array of distance readings from the left sensor
    rightSensor: number[]; // Array of distance readings from the right sensor
    downSensor: number[]; // Array of altitude readings over time
    TopSensor: number[]; // Array of altitude readings over time
    yaw: number[]; // Array of yaw readings over time
    pitch: number[]; // Array of pitch readings over time
    roll: number[]; // Array of roll readings over time
    time: number[]; // Array of time readings over time
}
```

### data/ — every export and its shape

`data/demoFlights.tsx`:

```ts
export const demoFlights: Flight[] = [
  { id: 1, name: "Cave Exploration Alpha", duration: 540, maxAltitude: 3.2, distance: 1250.5, batteryUsage: 18.2, flightPath: flightData1, video: "https://www.w3schools.com/html/mov_bbb.mp4" },
  { id: 2, name: "Deep Shaft Descent",     duration: 820, maxAltitude: 12.0, distance: 890.0,  batteryUsage: 35.0, flightPath: flightData2, video: "https://www.w3schools.com/html/mov_bbb.mp4" },
  { id: 3, name: "Narrow Passage Mapping", duration: 315, maxAltitude: 1.2,  distance: 420.8,  batteryUsage: 8.5,  flightPath: flightData3, video: "https://www.w3schools.com/html/mov_bbb.mp4" },
];
```
Shape: `Flight[]`, length 3, matches `types/flightT.tsx`'s `Flight` interface exactly.

`data/demoFlightsData.tsx`:

```ts
export const flightData1: FlightData = { frontSensor: number[10], backSensor: number[10], leftSensor: number[10], rightSensor: number[10], downSensor: number[10], TopSensor: number[10], yaw: number[10], pitch: number[10], roll: number[10], time: number[10] };
export const flightData2: FlightData = { ...same 10 keys, arrays of length 6 };
export const flightData3: FlightData = { ...same 10 keys, arrays of length 5 };

export const demoFlightsData: Record<string, FlightData> = {
  flightData1,
  flightData2,
  flightData3
};
```
Each of `flightData1/2/3` matches `FlightData` exactly (all 10 required keys present). `demoFlightsData` is a 3-entry `Record<string, FlightData>` keyed by the literal variable names `"flightData1"`, `"flightData2"`, `"flightData3"` — it is not consumed anywhere in `app/`, `components/`, `contexts/`, or `services/` (only `demoFlights.tsx` imports the individual `flightData1/2/3`, not the `demoFlightsData` record itself).

---

## 3. Screens

### app/_layout.tsx
Not a screen but the root. Renders `ThemeProvider` → `DroneConnectionProvider` → `Stack` (headerless) → `StatusBar`. Holds no state itself beyond `useColorScheme()`.

### app/index.tsx
Renders: `Header`, a status line (yellow "Reading parameters…" while `tocProgress` is present, else cyan "N parameters loaded" + mission-app-detected/not-found when `params.size > 0`, else nothing), a placeholder "hologram" box, and a download button.
From `useDroneConnection()`: `isConnected`, `params`, `tocProgress`.
Button press: "Download Last Flight Log" → `downloadFlightLog()` → sets `isDownloading`, waits 2.5s (`setTimeout`), then sets `flightPath` to a hardcoded 12-point coordinate array (comment: "In full production, this triggers a BLE subscription listener... For UI development, we will simulate...").
Local state: `flightPath: [number,number,number][]`, `isDownloading: boolean`.

### app/history.tsx
Renders: `Header` + `ScrollView` of `FlightCard`s mapped from `demoFlights`.
From `useDroneConnection()`: nothing (no hook call at all).
Button press: none actually wired — a local `handleCardPress` is defined (shows an `Alert` "Feature Coming Soon!") but never passed to `FlightCard` or attached to anything.
Local state: none.

### app/mission.tsx
Renders: `Header`, "Pre-Flight Checklist" title, a card with Mission Timer / Max Altitude Ceiling text inputs and two checkboxes (Obstacle Avoidance, Return-To-Home), and a Start button.
From `useDroneConnection()`: `isConnected`, `connectedDevice`.
Button press: "Sync & Start Autonomous Mission" (disabled unless `isConnected`) → `startMission()`:
1. `sendParameter(PARAM_MISSION_TIMER, missionTimer, 'uint16')`
2. `sendParameter(PARAM_MISSION_RTH, rthEnabled ? 1 : 0, 'uint8')`
3. waits 100ms
4. sends `PARAM_MISSION_STATE = 1` three times, 50ms apart, then once more
5. shows a success `Alert`
`sendParameter` builds packets via `CrtpService.writeParameter(id, value, type)` (the hardcoded-numeric-ID shim) and writes directly to `connectedDevice` on `CRAZYFLIE_SERVICE`/`CRAZYFLIE_RX` — it does not go through the context's `sendCrtp`/`setParam`.
Local state: `missionTimer` (default 60), `missionMaxAltitude` (default 500, mm — **never actually sent, per its own comment**), `avoidanceEnabled` (default true, **never sent**), `rthEnabled` (default true, sent).

### app/modal.tsx
Renders: `ThemedView` with `ThemedText` title "This is a modal" and a link back to `/`.
From `useDroneConnection()`: not used.
Button press: the link navigates to `/`.
Local state: none. Not reachable from any in-app navigation (no `Link`/`router.push('/modal')` anywhere else in the repo) — only reachable by direct URL.

### app/settings.tsx
Renders: `Header`, "Settings" label, Mission Timer / Max Altitude inputs, and 4 checkboxes (Obstacle Avoidance, RTH, DarkMode, Notifications) — the last three checkboxes are all bound to the **same** `rthEnabled` state variable (see section 8).
From `useDroneConnection()`: not used.
Button press: none — no submit/save action exists.
Local state: `missionTimer` (default 0), `missionMaxAltitude` (default 0), `avoidanceEnabled` (default false), `rthEnabled` (default false). Nothing here is sent over BLE, saved, or read by any other screen.

### app/setup.tsx
Renders: `Header`, "Hardware Setup" card with a prerequisites checklist and an "Install Autonomous Brain to Drone" button (or a progress bar while flashing).
From `useDroneConnection()`: `isConnected`, `connectedDevice`.
Button press: "Install Autonomous Brain to Drone" (disabled unless `isConnected`) → `startOTA()`:
1. `OtaService.rebootToBootloader(connectedDevice)` (comment admits: "Normally the BLE connection drops here... For UX simulation, we assume the bootloader connection is handled via connectedDevice")
2. `OtaService.readFirmwareFile()`
3. `OtaService.uploadFirmwareChunks(...)` with a progress callback
4. `OtaService.rebootToFirmware(connectedDevice)`
5. success/error `Alert`
Local state: `progress: number`, `isFlashing: boolean`.

### app/tuning.tsx
Renders: `Header`, "Live PID Tuning" title/subtitle, a disconnected-drone warning banner, and 5 stepper rows (Right Wall P-Gain, Ceiling P-Gain, Target Wall Distance, Target Ceiling Distance, Max Forward Velocity).
From `useDroneConnection()`: `isConnected`, `connectedDevice`.
Button press: each row's `-`/`+` button (and direct text-input edits) call `handleTune` → updates local state and immediately calls `syncParameter(id, val, type)`, which builds a packet via `CrtpService.writeParameter` (hardcoded numeric ID, again bypassing the context) and writes it straight to `connectedDevice`.
Local state: `kpWall` (0.0015), `kpCeiling` (0.0010), `targetWall` (400), `targetCeiling` (500), `maxV` (0.2) — all sent on every change, live, whenever connected.

---

## 4. Hardcoded CRTP parameter IDs

Firmware-parameter numeric IDs hardcoded in screens (matched to firmware by comment/name, not by TOC lookup):

```
app/mission.tsx:13:const PARAM_MISSION_STATE = 1;  // uint8
app/mission.tsx:14:const PARAM_MISSION_TIMER = 2;  // uint16
app/mission.tsx:15:const PARAM_MISSION_RTH = 3;    // uint8
app/tuning.tsx:10:const PARAM_KP_WALL = 4;
app/tuning.tsx:11:const PARAM_KP_CEILING = 5;
app/tuning.tsx:12:const PARAM_TARGET_WALL = 6;
app/tuning.tsx:13:const PARAM_TARGET_CEILING = 7;
app/tuning.tsx:14:const PARAM_MAX_V = 8;
```

Protocol-level `PARAM_*` constants (CRTP param-subsystem channel/command numbers, not firmware parameter IDs — included because they match the requested `PARAM_*` naming pattern):

```
services/CrtpService.ts:13:export const PARAM_CHAN_TOC = 0;
services/CrtpService.ts:14:export const PARAM_CHAN_READ = 1;
services/CrtpService.ts:15:export const PARAM_CHAN_WRITE = 2;
services/CrtpService.ts:18:export const PARAM_CMD_GET_ITEM = 2;
services/CrtpService.ts:19:export const PARAM_CMD_GET_INFO = 3;
```

No other numeric CRTP parameter IDs were found anywhere else in the repo (checked `app/`, `components/`, `contexts/`, `services/`, `server/`).

---

## 5. Broken or incomplete

**TypeScript errors:** `npx tsc --noEmit -p tsconfig.json` (the root project, which per `tsconfig.json`'s `include: ["**/*.ts", "**/*.tsx", ...]` also picks up `server/logManager.ts`) reports **0 errors**. The project compiles cleanly. There is nothing to break down into "5 most common error types" — there are none.

**Unused / unreachable files:**
- `components/hello-wave.tsx`, `components/external-link.tsx`, `components/parallax-scroll-view.tsx`, `components/haptic-tab.tsx`, `components/ui/collapsible.tsx`, `components/ui/icon-symbol.tsx`, `components/ui/icon-symbol.ios.tsx` — none are imported anywhere under `app/`. Default Expo-template leftovers.
- `app/modal.tsx` — a real, working route, but nothing in the app links or navigates to it.
- Context exports `bleAvailable` and `setParam` (both on `DroneContextType`) are never read/called by any screen or component.
- `data/demoFlightsData.tsx`'s `demoFlightsData` `Record` export is never imported anywhere (only the individual `flightData1/2/3` are used, by `demoFlights.tsx`).

**Stubs / placeholders:**
- `app/index.tsx`'s `downloadFlightLog()` is a hardcoded `setTimeout` + literal 12-point array; its own comment says it's simulating the real BLE memory-read flow.
- `app/setup.tsx`'s OTA flow explicitly assumes the bootloader BLE reconnection "is handled" without actually doing it (see comment at line 27-28).
- `services/OtaService.ts`'s `uploadFirmwareChunks` sends bare `[0x40, ...chunk]` packets with a comment admitting "A true bootloader flash requires specific memory addressing headers here" — the memory-write protocol isn't implemented.
- `services/OtaService.ts`'s `rebootToFirmware` comment: "Sending a fake reboot command for now to close the loop."
- `services/OtaService.ts` reads and "flashes" a `.c` **source** file, not a compiled `.bin` — see section 8.
- `app/settings.tsx` — all 4 checkboxes and both inputs are inert local state; no BLE call, no persistence, no consumer.

**TODO / "coming soon" behaviour:**
- `app/history.tsx`'s unused `handleCardPress`: `Alert.alert("Feature Coming Soon!", "Sorry, this feature is unavailable at the moment.")` — dead code, never wired to the actual `FlightCard` press handler (which has its own, different, working alert).

---

## 6. Leftovers

**`assets/firmware/`** contains one file: `cavebat.c` (165 lines). It is **untracked** in git (`git status` shows `?? assets/firmware/cavebat.c`) — i.e. it exists in the working tree but has never been committed. Its `PARAM_GROUP_START(mission)` block exposes `mission.state`, `mission.timer`, `mission.height`, `mission.maxtime`, `mission.vbatmin`.

The file it appears to replace, `assets/firmware/app_wall_follower.c` (287 lines), was added in commit `a7b7432` ("BLE connection") and is currently **deleted** in the working tree (`git status` shows `D assets/firmware/app_wall_follower.c`, not yet committed). Its `PARAM_GROUP_START(mission)` block exposed `mission.state`, `mission.timer`, `mission.rth`, `mission.kp_wall`, `mission.kp_ceiling`, `mission.target_wall`, `mission.target_ceiling`, `mission.max_v` — which is the parameter set `app/mission.tsx` and `app/tuning.tsx`'s hardcoded IDs correspond to by name (see section 8).

**metro.config.js** (full file):
```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Tell Metro to recognize both .bin and .c files as raw assets
config.resolver.assetExts.push('bin', 'c');

module.exports = config;
```

**app.json** — `plugins` and permission-related content:
```json
"plugins": [
  "expo-router",
  [
    "expo-splash-screen",
    {
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 200,
      "resizeMode": "contain",
      "backgroundColor": "#ffffff",
      "dark": { "backgroundColor": "#000000" }
    }
  ],
  [
    "react-native-ble-plx",
    {
      "isBackgroundEnabled": false,
      "modes": ["peripheral", "central"],
      "bluetoothAlwaysPermission": "Allow cave-controller to connect to the Crazyflie drone.",
      "bluetoothPeripheralPermission": "Allow cave-controller to connect to the Crazyflie drone."
    }
  ],
  "expo-dev-client"
]
```
There is no standalone top-level `"permissions"` key in `app.json` — the only permission-related configuration is the `bluetoothAlwaysPermission`/`bluetoothPeripheralPermission` strings inside the `react-native-ble-plx` plugin config above (these become iOS `Info.plist` usage-description strings), plus Android runtime permissions requested at call-time in `DroneConnectionContext.tsx` (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`).

**CLAUDE.md** exists at the repo root. It documents: the project as "CaveBat," an Expo/RN app controlling a Crazyflie 2.x with Flow deck v2 + Multi-ranger deck; the intended 8-step flight flow (flash → power on → BLE connect → send timer → autonomous flight → land → download log → 3D render); the Bitcraze BLE transport facts (service UUID, characteristic roles, control-byte bit layout, base64 transport); the "look parameters up by name via TOC" design decision; a short repo layout section; and a Status section noting firmware isn't written yet and listing `CRAZYFLIE_RX`, and `mission.tsx`/`tuning.tsx`'s hardcoded-ID + shim usage, and `index.tsx`'s fake log download as known-wrong/pending items.

---

## 7. Dependencies

Verbatim from `package.json`:

```json
"dependencies": {
    "@config-plugins/react-native-ble-plx": "^7.0.0",
    "@expo/vector-icons": "^15.0.3",
    "@react-navigation/bottom-tabs": "^7.4.0",
    "@react-navigation/elements": "^2.6.3",
    "@react-navigation/native": "^7.1.8",
    "buffer": "^6.0.3",
    "expo": "~54.0.33",
    "expo-asset": "~12.0.13",
    "expo-camera": "~17.0.10",
    "expo-checkbox": "~5.0.8",
    "expo-constants": "~18.0.13",
    "expo-dev-client": "~6.0.21",
    "expo-device": "~8.0.10",
    "expo-file-system": "~19.0.22",
    "expo-font": "~14.0.11",
    "expo-haptics": "~15.0.8",
    "expo-image": "~3.0.11",
    "expo-linking": "~8.0.11",
    "expo-router": "~6.0.23",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "expo-symbols": "~1.0.8",
    "expo-system-ui": "~6.0.9",
    "expo-web-browser": "~15.0.10",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-ble-plx": "^3.5.1",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-paper": "^5.15.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-web": "~0.21.0",
    "react-native-worklets": "0.5.1"
},
"devDependencies": {
    "@types/react": "~19.1.0",
    "eslint": "^9.25.0",
    "eslint-config-expo": "~10.0.0",
    "typescript": "~5.9.2"
}
```

Note: `react-native-paper`, `expo-camera`, `expo-device`, `expo-constants`, `expo-linking`, and `expo-image` are present in `dependencies` but no import of any of them was found anywhere in `app/`, `components/`, `contexts/`, `hooks/`, `constants/`, `data/`, or `types/` during this audit — they appear unused by the current source (not exhaustively verified against every third-party transitive re-export). `@react-navigation/bottom-tabs` and `@react-navigation/elements` are imported, but only by `components/haptic-tab.tsx`, which is itself unused (see section 5) — so these two are also effectively dead weight in practice.

---

## 8. Anything surprising

- **The hardcoded param IDs point at a firmware parameter set that no longer exists.** `app/mission.tsx` and `app/tuning.tsx` hardcode numeric IDs matched by comment/name to `mission.state/timer/rth/kp_wall/kp_ceiling/target_wall/target_ceiling/max_v` — exactly the `PARAM_GROUP_START(mission)` block in the now-deleted `assets/firmware/app_wall_follower.c`. The firmware file actually present in the working tree, `cavebat.c`, exposes a *different and shorter* set: `mission.state/timer/height/maxtime/vbatmin`. If `cavebat.c` were flashed and these screens used, the numeric IDs would resolve to whatever parameter happens to occupy that slot in `cavebat.c`'s 5-entry TOC (if it exists at all), not the wall-follower parameter the UI labels claim.
- **The by-name TOC lookup path is built but completely dead.** `contexts/DroneConnectionContext.tsx` implements exactly what `CLAUDE.md` prescribes — fetch the TOC on connect, expose `params: Map<string, ParamEntry>`, expose `setParam(fullName, value)` — but no screen calls `setParam` or reads from `params` to drive a write. `app/mission.tsx` and `app/tuning.tsx` still go through the legacy `CrtpService.writeParameter(numericId, ...)` shim, which is the exact pattern `CLAUDE.md` calls "a bug." `app/index.tsx` only reads `params`/`tocProgress` to render a status string, never to look anything up.
- **`services/OtaService.ts` "flashes" raw C source, not a compiled binary.** `readFirmwareFile()` `require()`s `assets/firmware/cavebat.c` and uploads its raw bytes over CRTP as if it were firmware. `metro.config.js` was specifically modified (`assetExts.push('bin', 'c')`) to make requiring a `.c` file work at all. Writing C source text into flash would not produce running firmware; in-file comments ("Change this line", references to a `.bin`) suggest a compiled binary was intended to replace this later.
- **Two independent, disconnected copies of "Mission Timer" / "Max Altitude" state exist** — one in `app/mission.tsx` (actually sent over BLE, partially: timer is sent, altitude is not) and one in `app/settings.tsx` (never sent anywhere, never persisted, never read back). Editing one has zero effect on the other.
- **`app/settings.tsx` binds three different checkboxes (RTH, DarkMode, Notifications) to the same `rthEnabled` state variable** (lines 34/38/42 in the file), so toggling any one of the three toggles all three simultaneously.
- **Duplicate, inconsistent tap handlers.** `app/history.tsx` defines its own unused `handleCardPress` with one alert message; `components/flightCard.tsx` defines a separate, actually-wired `handleCardPress` with a different message. The one that fires is the one in `FlightCard`.
- **Two screens share the default export name `App`** (`app/index.tsx` and `app/history.tsx`), while `app/settings.tsx`'s default export is named `ScreenName` — cosmetic, but inconsistent across otherwise-parallel route files.
- **`server/` is a second, separate Node/TypeScript project** living inside this repo (own `package.json`, `node_modules`, `tsconfig.json`), containing an `EventEmitter`-based `logManager.ts` that nothing in `app/`, `components/`, `contexts/`, or `services/` imports. Despite being logically separate, `server/logManager.ts` is still picked up by the **root** `tsconfig.json`'s `**/*.ts` include (confirmed via `tsc --listFiles`) and compiles clean as part of the app's typecheck.
- **`android/` is a full native prebuild output present in the working tree** (including `android/app/build/generated/...` Gradle artifacts) but is git-ignored (`.gitignore` has `/android` under "generated native folders") — i.e. it's a local build byproduct, not part of the tracked repo, despite sitting alongside the tracked source.
- **Working tree currently has uncommitted changes** beyond what this report describes as "current state": `app/index.tsx`, `app/mission.tsx`, `contexts/DroneConnectionContext.tsx`, `services/CrtpService.ts`, and `services/OtaService.ts` are modified but not committed; `CLAUDE.md` and `assets/firmware/cavebat.c` are new/untracked; `assets/firmware/app_wall_follower.c` is deleted but not committed. This report describes the working tree as it stands, not the last commit (`a7b7432`).
