# CaveBat

A mobile ground control station for a Bitcraze Crazyflie 2.x drone, communicating over Bluetooth Low Energy with custom firmware running on the drone.

Built as a final project for a Software Practical Engineering diploma.

<!-- Add a screenshot of the app here, or a short GIF of the drone taking off. It is the single most valuable thing you can put in this file. -->

## What it does

The app connects to a Crazyflie 2.x over BLE, sends flight commands, and reads back flight data. There is no PC and no Crazyradio dongle in the loop at flight time — the phone talks to the drone directly.

- Plan and start a mission from the phone
- Configure hardware and tune flight parameters live
- Browse flight history
- Push firmware updates over the air

## How it works

```
React Native app  ──BLE──►  nRF51 radio  ──►  STM32F405  ──►  flight
   (phone)                  (Crazyflie)      (custom C firmware)
        │
        └──HTTPS──►  Node.js / Express / MongoDB backend
```

**Mobile app** — React Native (Expo) with TypeScript. A context layer owns the BLE connection and the CRTP packet transport; a service layer encodes and decodes CRTP; screens cover mission planning, hardware setup, live tuning and flight history.

**Firmware** — custom C running on the drone's STM32F405, built as an out-of-tree Crazyflie app with the ARM GCC toolchain and flashed over a Crazyradio PA. It lives in its own repository: [cave_bat_firmWare](https://github.com/yaligbd/cave_bat_firmWare).

**Backend** — Node.js, TypeScript, Express and MongoDB, deployed on Render.

**Protocol** — CRTP (Crazyflie Real-Time Protocol) over BLE, across the console, parameter, command, memory and logging ports.

## Hardware

- Bitcraze Crazyflie 2.x
- Flow deck v2 (optical flow and height)
- Multi-ranger deck (obstacle ranging)
- Crazyradio PA (used for flashing firmware, not for flight)

## Running it

The app needs a custom Expo dev build — Expo Go cannot use BLE.

```bash
npm install
npx expo run:android      # or: npx expo run:ios
```

The drone needs the matching custom firmware flashed onto it — see [cave_bat_firmWare](https://github.com/yaligbd/cave_bat_firmWare) for how to build and flash it.

## Status

Working:

- BLE connection and CRTP transport from the phone
- Parameter reads and writes
- Autonomous timed hover, commanded from the app
- Live telemetry streaming into the app

On stock firmware, CRTP log streaming never starts over BLE: it sits behind a connection check that only reports a connected state for the radio link. The custom firmware bypasses that check, which is what makes live telemetry work here.

## Notes on the BLE link

Two constraints shaped most of the implementation:

- BLE notifications cap out at 20 bytes, which truncates longer parameter names and requires matching them back to their full form.
- The nRF51 BLE bridge is poll-driven — it needs a continuous stream of null packets to keep delivering data.

<!-- TODO: add a LICENSE file if you want this to be reusable. -->
