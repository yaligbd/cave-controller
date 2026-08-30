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

    // The drone's OWN measured position, in metres, one entry per sample.
    //
    // Optional because flights saved before these existed do not have them.
    // Without them the 3D view has no choice but to invent a path -- it used
    // to assume a constant 1.5 m/s forward along yaw, which drew a straight
    // diagonal line regardless of what the drone actually did.
    posX?: number[];
    posY?: number[];
    posZ?: number[];
} 