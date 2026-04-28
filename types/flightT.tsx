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