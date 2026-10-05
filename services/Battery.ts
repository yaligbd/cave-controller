// LiPo open-circuit voltage -> approximate remaining charge.
//
// Piecewise linear between these reference points; not a real discharge curve,
// just enough to give a rough sense of "fine / getting low / land now".
//
// This lived inside app/index.tsx until the header needed it too. It is pure
// arithmetic over a number the drone reports, so it belongs beside the other
// services rather than inside a screen.
const LIPO_CURVE: [voltage: number, percent: number][] = [
  [4.2, 100],
  [4.0, 75],
  [3.85, 50],
  [3.7, 25],
  [3.3, 0],
];

export function lipoPercent(voltage: number): number {
  if (voltage >= LIPO_CURVE[0][0]) return 100;
  const last = LIPO_CURVE[LIPO_CURVE.length - 1];
  if (voltage <= last[0]) return 0;
  for (let i = 0; i < LIPO_CURVE.length - 1; i++) {
    const [vHigh, pHigh] = LIPO_CURVE[i];
    const [vLow, pLow] = LIPO_CURVE[i + 1];
    if (voltage <= vHigh && voltage >= vLow) {
      const t = (voltage - vLow) / (vHigh - vLow);
      return pLow + t * (pHigh - pLow);
    }
  }
  return 0;
}

/**
 * Pack voltage from whichever log variable this firmware publishes.
 *
 * MIND THE UNITS. `tele.vbat` is uint16 MILLIVOLTS from cavebat.c; `pm.vbat` is
 * a float in VOLTS from the stock firmware. Dividing both by 1000 renders a
 * healthy 4.03V pack as 0.004V. Falling back to the stock variable means the
 * battery still reads out on a drone running something other than CaveBat,
 * instead of silently showing nothing and looking broken.
 */
export function packVolts(logValues: Map<string, number>): number | undefined {
  const teleMv = logValues.get('tele.vbat');
  if (teleMv !== undefined) return teleMv / 1000;
  return logValues.get('pm.vbat');
}
