# CaveBat

Expo / React Native app that controls a Bitcraze Crazyflie 2.x fitted with a Flow deck v2
and a Multi-ranger deck. The drone runs custom firmware and flies autonomously; the phone
only starts the mission and downloads the log afterwards. It is not a live remote control.

## Intended flight flow

1. Flash the firmware once from a PC over Crazyradio.
2. Power on the drone.
3. Phone connects over BLE.
4. Phone sends a timer.
5. Drone flies autonomously — no phone link required in the air.
6. Drone returns and lands.
7. Phone downloads the recorded flight log over BLE.
8. App renders the path in 3D.

## Transport facts (Bitcraze BLE spec — do not change these)

- Service `00000201-1c7f-4f9e-947b-43b7c00a9a08`
- `0x0202` CRTP: simple, 20-byte limited. **We do not use it.**
- `0x0203` CRTPUP: uplink. First byte is a control byte, the rest is raw CRTP data.
- `0x0204` CRTPDOWN: downlink, notify only, same format.
- Control byte: bit 7 = Start, bits 5-6 = PID, bits 0-4 = Length.
- Packets longer than 19 bytes are written twice; the second write has Start=0, Length=0,
  and the same PID.
- `react-native-ble-plx` transfers base64 strings, not byte arrays.

## Key design decision: look parameters up by name

Crazyflie parameters are addressed by a numeric ID that the firmware assigns across the
whole build. **Hardcoding IDs is a bug.** We download the parameter TOC on connect and
look parameters up by name, e.g. `"mission.state"`.

## Layout

- `services/CrtpService.ts` — the authority on all byte-level encoding: base64, CRTP
  headers, BLE fragmentation/reassembly, param TOC parsing, param writes. It contains no
  Bluetooth code by design. Do not duplicate its logic anywhere else.
- `services/OtaService.ts` — over-the-air flashing experiment; not part of the intended flow.
- `contexts/DroneConnectionContext.tsx` — BLE scan / connect / disconnect, React context.
- `app/` — expo-router screens: `index` (log download + 3D view), `mission` (pre-flight
  checklist and start), `tuning`, `setup`, `history`, `settings`.
- `components/`, `constants/theme.ts`, `hooks/`, `data/` (demo flight fixtures), `types/`.
- `server/` — separate scratch Node project, unrelated to the app.

## Status

Firmware is not written yet; the drone currently runs stock firmware, so nothing end-to-end
has flown. Known-wrong code that predates the decisions above:

- `DroneConnectionContext` exports `CRAZYFLIE_RX` pointing at `0x0202`, the characteristic
  we do not use.
- `app/mission.tsx` and `app/tuning.tsx` hardcode parameter IDs and go through the
  `CrtpService` compatibility shim at the bottom of the file. Both screens need rewriting
  against the TOC lookup.
- `app/index.tsx` fakes the log download with a hardcoded path and a `setTimeout`.
