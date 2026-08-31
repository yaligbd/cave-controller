# CaveBat

Expo / React Native app that controls a Bitcraze Crazyflie 2.x fitted with a Flow deck v2
and a Multi-ranger deck. The drone runs custom firmware and flies autonomously; the phone
starts the mission and collects the flight data. It is not a live remote control.

## Intended flight flow

1. Flash the firmware once from a PC over Crazyradio.
2. Power on the drone.
3. Phone connects over BLE.
4. Phone sends a timer.
5. Drone flies autonomously — no phone link required in the air.
6. Drone returns and lands.
7. Phone collects the flight and renders the path in 3D.

**Where this actually stands:** all seven steps work, and wall following works on top
of them. Verified 2026-08-31: the drone took off, followed a wall, turned back at half
the timer, retraced its own route home and landed, recording throughout, and the phone
downloaded the flight afterwards.

**THE DRONE IS CURRENTLY RUNNING FIRMWARE TAG `v11-turning`.** If the app and the drone
ever disagree about what exists, that tag is the truth. The firmware repo has one commit
after it -- a settle-after-turning change that was built but NEVER FLASHED, because
testing ended before it could be flown. Do not assume it is on the aircraft.

**Reliability, stated honestly.** Hover flights are reliable. Wall-following flights
crashed roughly one time in two, and the cause was never diagnosed: no log of a
wall-following crash was ever captured across three sessions. Downloads usually work but
sometimes need the automatic retries. None of this is fixed.

**A download must pause the log blocks first, and pump at full speed.** Three blocks
streaming at 200ms/200ms/1000ms saturate a 20-byte-per-packet link so the drone's reply
cannot get through, and the null packet the app sends when idle is what makes the bridge
flush its downlink at all. The drone services a dump request in 100ms and sends
everything in 60ms -- it was never the slow part.

## Working on the app without the drone

Every file that can stop the drone flying now carries a **FLIGHT-CRITICAL** header
explaining what breaks and how it was learned. Those four are:

- `services/CrtpService.ts` -- the exact bytes on the wire
- `services/TocCache.ts` -- the name-to-ID mapping, and why the version must be bumped
- `contexts/DroneConnectionContext.tsx` -- connection, log blocks, and the takeoff command
- `app/mission.tsx` -- the screen that launches the drone

Everything else carries a **SAFE TO CHANGE WITHOUT THE DRONE** header. The 3D view, the
flight cards, the measurements table and the stored-flight format only read data that
already exists, and that is where to work while the hardware is away.

## Hard limits learned the expensive way — do not rediscover these

**A log block create packet must fit ONE 20-byte BLE notification.** It is `3 + 3*N` bytes,
so **five variables maximum**. Six is 21 bytes, gets split across two notifications, and
split packets arrive corrupted — the drone then echoes back a command that was never sent.

**Never create two log blocks back to back.** Their fragments interleave and whichever
block loses the race is silently destroyed, with no error anywhere. Stagger them (~1.5s).

**A log block's data payload is capped at 26 bytes** (`LOG_MAX_LEN` in the firmware). An
over-limit block is rejected outright and streams *nothing* — not a truncated subset.

**`LOG_CTRL_DELETE_BLOCK` is 2, not 5.** Command 5 is RESET, which erases every block on
the drone. This was wrong for a long time and made "delete one block" wipe them all.

**The BLE MTU cannot be raised.** The nRF51 runs SoftDevice s130, whose ATT_MTU is fixed at
23 (20 usable bytes). Every multi-fragment packet therefore loses one byte at the fragment
boundary, which is why TOC names arrive corrupted and `repairName()` exists. Requests for a
larger MTU silently no-op. **Do not spend time on this again.**

**Read the drone's replies.** It answers every log control command with `[cmd, blockId,
errorCode]`. Ignoring those made a rejected block indistinguishable from a working one.
Most real bugs here were found by making the drone report on itself, not by reasoning.

## Transport facts (Bitcraze BLE spec — do not change these)

- Service `00000201-1c7f-4f9e-947b-43b7c00a9a08`
- `0x0203` CRTPUP: uplink. First byte is a control byte, the rest is raw CRTP data.
- `0x0204` CRTPDOWN: downlink, notify only, same format.
- Control byte: bit 7 = Start, bits 5-6 = PID, bits 0-4 = Length.
- `react-native-ble-plx` transfers base64 strings, not byte arrays.

## Parameters are looked up by name, and the catalogue is cached

Crazyflie parameters are addressed by a numeric ID the firmware assigns per build, so
hardcoding IDs is a bug. The catalogue is fetched once and cached to disk under the drone's
own CRC (`services/TocCache.ts`); connection went from 4–5 minutes to seconds. A reflash
that changes the catalogue misses the cache and refetches rather than returning stale IDs.

## Layout

- `services/CrtpService.ts` — the authority on all byte-level encoding: base64, CRTP
  headers, BLE fragmentation/reassembly, TOC parsing, param writes. No Bluetooth code by
  design. Do not duplicate its logic anywhere else.
- `services/TocCache.ts` — disk cache for the parameter and log catalogues.
- `services/FlightStore.ts` — saved flights, one JSON file each. `buildFlight()` converts
  raw drone samples into the shape the 3D view reads.
- `contexts/DroneConnectionContext.tsx` — BLE scan/connect, log blocks, telemetry, and the
  phone-side flight recorder.
- `app/` — expo-router screens: `index` (connect + hardware checklist), `mission`,
  `simulator` (3D view, flight cards, measurements table), `sensors`, `settings`.
- `components/FlightDataModal.tsx` — every recorded sample as a table, for developing the
  3D view without flying repeatedly.

## Known issues

- **Roughly half of takeoffs crash.** The estimator prints `ESTKALMAN: State out of
  bounds, resetting` during the climb and the drone flies on a wrong estimate. Every
  takeoff also sags the battery 550–600mV, and the worst sag observed was the crash. Which
  of the two is cause and which is symptom is NOT established. This is the largest
  remaining risk to the project.
- **Range sensor streaming to the sensors screen is off.** Deferred, not broken.
- **The Flow deck needs visible floor texture.** On plain wood the position estimate
  diverges and the drone flips on takeoff. On a patterned surface (towels) it flies fine.
  This is the single biggest cause of bad flights and bad data.
- `app/sensors.tsx` shows dashes rather than stale values, on purpose.
- `services/OtaService.ts` is an unused experiment.
