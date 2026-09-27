// Turning what the Bluetooth stack says into something an operator can act on.
//
// WHY THIS EXISTS. The raw strings that reach the UI are written for whoever
// wrote the library, not for whoever is holding the drone:
//
//   "Operation was rejected"
//   "Device CE:C9:6C:8C:95:57 was disconnected"
//   "CRTP write timed out after 2000ms"
//
// All three mean the same thing in practice -- the link to the drone is gone --
// and none of them say what to do about it. Worse, showing three different
// messages for one condition makes it look like three different faults.
//
// So every known failure is mapped to three things: what happened, what it
// means, and what to do. The raw text is never thrown away -- it goes in the
// dialog's detail block, because that is what gets pasted into a log when
// something needs diagnosing.
//
// The advice here is not generic. It comes from faults this project has
// actually had: a Multi-ranger whose I2C expander stops answering until the
// deck is reseated, a drone that latches a crashed state until it is power
// cycled, and a BLE link that drops the moment the aircraft hits something.

export interface DroneErrorInfo {
  /** Short, replaces the bare word "Error" as the status headline. */
  title: string;
  /** What it means, in plain language. */
  message: string;
  /** What to do about it. Omitted only when there is genuinely nothing to suggest. */
  fix?: string;
  /** The original text, kept for the detail block. */
  raw?: string;
}

interface Rule {
  /** Matched case-insensitively against the raw message. */
  match: RegExp;
  info: Omit<DroneErrorInfo, 'raw'>;
}

// Order matters: the first match wins, so the specific rules come first.
const RULES: Rule[] = [
  {
    // The drone reports which self-test failed, and on this airframe it is
    // nearly always the Multi-ranger's I2C expander, which takes all five
    // range sensors down with it.
    match: /self[- ]?test|deck \[FAIL\]|expander|Init (front|back|up|left|right)/i,
    info: {
      title: 'Drone failed its self-test',
      message:
        'The drone started but one of its checks failed, so the flight firmware never ran. ' +
        'It will ignore every command until this is fixed.',
      fix:
        'If the failure mentions the expander or the range sensors, power off and reseat the ' +
        'Multi-ranger deck — press both pin header rows fully home. Then power on with the ' +
        'drone flat and untouched, since the gyro test fails if it moves during boot.',
    },
  },
  {
    match: /disconnected|was disconnected|connection lost/i,
    info: {
      title: 'Lost the drone',
      message: 'The Bluetooth link dropped. The drone is no longer taking commands from the app.',
      fix:
        'If it was flying, it keeps running its mission on its own — that is by design. ' +
        'Otherwise it usually means it went out of range, crashed, or the battery died. ' +
        'Tap Connect to find it again.',
    },
  },
  {
    match: /timed out|timeout/i,
    info: {
      title: 'Drone stopped answering',
      message:
        'A command was sent but nothing came back. The link is either gone or too congested to reply.',
      fix: 'Move the phone closer to the drone and reconnect. If it keeps happening, power cycle the drone.',
    },
  },
  {
    match: /was rejected|was cancelled|operation was/i,
    info: {
      title: 'Link closed',
      message: 'The Bluetooth connection was torn down while the app was still using it.',
      fix: 'This normally follows a disconnect. Tap Connect to start a fresh link.',
    },
  },
  {
    match: /no crazyflie found|not found|no drone/i,
    info: {
      title: 'No drone found',
      message: 'Nothing answered the scan.',
      fix:
        'Check the drone is switched on and its lights are active, keep it within a few metres ' +
        'of the phone, and make sure nothing else is already connected to it — it accepts one ' +
        'connection at a time.',
    },
  },
  {
    match: /permission/i,
    info: {
      title: 'Permission refused',
      message: 'Android needs Bluetooth and location permission before an app may scan for devices.',
      fix: 'Grant the permissions in Settings › Apps › CaveBat › Permissions, then tap Connect again.',
    },
  },
  {
    match: /bluetooth (is )?(off|disabled)|turn on bluetooth/i,
    info: {
      title: 'Bluetooth is off',
      message: 'The phone’s Bluetooth radio is switched off, so the drone cannot be reached.',
      fix: 'Turn Bluetooth on, then tap Connect.',
    },
  },
  {
    match: /not available|emulator/i,
    info: {
      title: 'No Bluetooth on this device',
      message: 'This device has no usable Bluetooth radio — usually because it is an emulator.',
      fix: 'Run the app on a real phone to connect to a drone.',
    },
  },
  {
    match: /parameter list|toc/i,
    info: {
      title: 'Could not read the drone’s settings',
      message:
        'The link came up but the parameter list did not finish loading, so the app does not ' +
        'know what this firmware can do.',
      fix: 'Disconnect and reconnect. If it fails again, power cycle the drone and try once more.',
    },
  },
  {
    match: /scan failed/i,
    info: {
      title: 'Scan failed',
      message: 'The phone could not start looking for nearby drones.',
      fix: 'Turn Bluetooth off and on again, then retry. Restarting the app clears a stuck scan.',
    },
  },
];

const UNKNOWN: Omit<DroneErrorInfo, 'raw'> = {
  title: 'Something went wrong',
  message: 'The app hit a fault it does not have a specific explanation for.',
  fix: 'Disconnect and reconnect. The technical detail below is worth keeping if it happens again.',
};

export function describeDroneError(raw: string | null | undefined): DroneErrorInfo {
  if (!raw || !raw.trim()) {
    return { ...UNKNOWN, message: 'No further detail was reported.', raw: undefined };
  }
  const rule = RULES.find((r) => r.match.test(raw));
  return { ...(rule ? rule.info : UNKNOWN), raw };
}
