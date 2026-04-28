import { Flight } from '../types/flightT';
import { flightData1, flightData2, flightData3 } from './demoFlightsData';


export const demoFlights: Flight[] = [
  {
    id: 1,
    name: "Cave Exploration Alpha",
    duration: 540, // 9 minutes
    maxAltitude: 3.2,
    distance: 1250.5,
    batteryUsage: 18.2,
    flightPath: flightData1,
    video: "https://www.w3schools.com/html/mov_bbb.mp4"
  },
  {
    id: 2,
    name: "Deep Shaft Descent",
    duration: 820, // 13 minutes 40 seconds
    maxAltitude: 12.0,
    distance: 890.0,
    batteryUsage: 35.0,
    flightPath: flightData2,
    video: "https://www.w3schools.com/html/mov_bbb.mp4"
  },
  {
    id: 3,
    name: "Narrow Passage Mapping",
    duration: 315, // 5 minutes 15 seconds
    maxAltitude: 1.2,
    distance: 420.8,
    batteryUsage: 8.5,
    flightPath: flightData3,
    video: "https://www.w3schools.com/html/mov_bbb.mp4"
  }
];
