import { FlightData } from '../types/flightT';

export const flightData1: FlightData = {
  frontSensor: [2.5, 2.3, 1.8, 1.5, 1.2, 1.0, 0.8, 1.2, 2.0, 2.5],
  backSensor: [5.0, 5.0, 5.2, 5.4, 6.0, 6.5, 7.0, 6.8, 6.0, 5.0],
  leftSensor: [1.0, 1.1, 1.1, 1.2, 1.2, 1.0, 0.9, 0.8, 1.2, 1.5],
  rightSensor: [3.4, 3.2, 3.0, 2.8, 2.5, 2.2, 2.0, 2.4, 2.8, 3.2],
  downSensor: [0.5, 1.2, 2.0, 2.5, 3.0, 3.2, 3.0, 2.5, 1.5, 0.2],
  TopSensor: [10.0, 9.3, 8.5, 8.0, 7.5, 7.3, 7.5, 8.0, 9.0, 10.3],
  yaw: [0, 5, 10, 15, 20, 22, 20, 15, 5, 0],
  pitch: [0, -2, -5, -3, 0, 2, 5, 3, 0, -1],
  roll: [0, 1, 2, 1, 0, -1, -2, -1, 0, 1],
  time: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
};

export const flightData2: FlightData = {
  frontSensor: [10.0, 9.5, 9.0, 8.0, 7.5, 6.0],
  backSensor: [1.2, 1.5, 2.0, 2.5, 3.0, 4.5],
  leftSensor: [4.0, 4.0, 4.0, 3.5, 3.0, 2.5],
  rightSensor: [4.0, 4.0, 4.0, 4.5, 5.0, 5.5],
  downSensor: [0.0, 5.0, 10.0, 12.0, 12.0, 10.0],
  TopSensor: [20.0, 15.0, 10.0, 8.0, 8.0, 10.0],
  yaw: [90, 90, 91, 92, 90, 88],
  pitch: [10, 12, 15, 10, 5, 0],
  roll: [0, 0, 0, 1, 2, 1],
  time: [0, 2, 4, 6, 8, 10]
};

export const flightData3: FlightData = {
  frontSensor: [1.5, 1.4, 1.3, 1.2, 1.1],
  backSensor: [0.8, 0.9, 1.0, 1.1, 1.2],
  leftSensor: [0.5, 0.5, 0.4, 0.4, 0.3],
  rightSensor: [0.5, 0.5, 0.6, 0.6, 0.7],
  downSensor: [1.2, 1.2, 1.2, 1.2, 1.2],
  TopSensor: [0.8, 0.8, 0.8, 0.8, 0.8],
  yaw: [180, 180, 180, 180, 180],
  pitch: [0, 0, 0, 0, 0],
  roll: [0, 0, 0, 0, 0],
  time: [0, 0.5, 1.0, 1.5, 2.0]
};

export const demoFlightsData: Record<string, FlightData> = {
  flightData1,
  flightData2,
  flightData3
};
