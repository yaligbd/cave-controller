import { useTheme } from '@/contexts/ThemeContext';
import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface BatIconProps {
  size?: number;
  color?: string;
}

// Minimal geometric bat silhouette: a small rounded body, two swept wings
// (each with a single shallow notch), and two small ear triangles. One
// compound fill path — no gradients, no fine detail — to match the flat
// tactical style used across the app.
const BAT_PATH =
  'M12,9 Q14,9 14.5,12 Q15,15 12,18 Q9,15 9.5,12 Q10,9 12,9 Z ' +
  'M10,9 L9,5 L11.5,8.3 Z ' +
  'M14,9 L15,5 L12.5,8.3 Z ' +
  'M9.5,11 L2,8 L5,12 L1,15 L9,14 Z ' +
  'M14.5,11 L22,8 L19,12 L23,15 L15,14 Z';

export default function BatIcon({ size = 24, color }: BatIconProps) {
  const { palette } = useTheme();
  const fillColor = color ?? palette.textPrimary;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={BAT_PATH} fill={fillColor} />
    </Svg>
  );
}
