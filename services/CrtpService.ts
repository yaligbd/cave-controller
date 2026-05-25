import * as base64 from 'base64-js';

// CRTP (Crazyflie RealTime Protocol) Service
// Header Byte Structure: (port << 4) | (link << 2) | channel

export class CrtpService {
  /**
   * Generates a base64 encoded CRTP packet.
   * @param port CRTP Port (0-15)
   * @param channel CRTP Channel (0-3)
   * @param payload Array of bytes (numbers 0-255)
   * @param link CRTP Link (usually 0)
   */
  static generateCrtpPacket(port: number, channel: number, payload: number[], link: number = 0): string {
    const header = (port << 4) | (link << 2) | channel;
    const packetBytes = new Uint8Array([header, ...payload]);
    return base64.fromByteArray(packetBytes);
  }

  /**
   * Generates a "Zero Thrust / Hover" setpoint for Commander (Port 3, Channel 0)
   * The basic commander packet format is:
   * - Roll (float32)
   * - Pitch (float32)
   * - Yaw (float32)
   * - Thrust (uint16_t)
   */
  static createHoverSetpoint(): string {
    const buffer = new ArrayBuffer(14);
    const view = new DataView(buffer);
    
    // Roll = 0.0 (float32)
    view.setFloat32(0, 0.0, true); // true for little-endian
    // Pitch = 0.0 (float32)
    view.setFloat32(4, 0.0, true);
    // Yaw = 0.0 (float32)
    view.setFloat32(8, 0.0, true);
    // Thrust = 0 (uint16)
    view.setUint16(12, 0, true);

    const payload = Array.from(new Uint8Array(buffer));
    
    // Commander Port = 3, Channel = 0
    return this.generateCrtpPacket(3, 0, payload);
  }

  /**
   * Generates a Parameter Write packet (Port 2, Channel 2)
   * @param paramId The 16-bit ID of the parameter
   * @param value The value to write
   * @param type The type of the parameter ('uint8' | 'uint16' | 'float')
   */
  static writeParameter(paramId: number, value: number, type: 'uint8' | 'uint16' | 'float'): string {
    const valueSize = type === 'uint8' ? 1 : type === 'uint16' ? 2 : 4;
    const buffer = new ArrayBuffer(2 + valueSize);
    const view = new DataView(buffer);
    
    // Param ID (uint16_t, little-endian)
    view.setUint16(0, paramId, true);
    
    // Value
    if (type === 'uint8') {
      view.setUint8(2, value);
    } else if (type === 'uint16') {
      view.setUint16(2, value, true);
    } else if (type === 'float') {
      view.setFloat32(2, value, true);
    }

    const payload = Array.from(new Uint8Array(buffer));
    
    // Parameter Port = 2, Channel = 2 (Write)
    return this.generateCrtpPacket(2, 2, payload);
  }

  /**
   * Generates a Memory Read Request packet (Port 4, Channel 1)
   * @param address Start address to read from
   * @param length Number of bytes to read (MTU safe, e.g., 12 bytes = 2 points)
   * @param memType Type of memory (default to EEPROM/SRAM ID)
   */
  static createMemoryReadRequest(address: number, length: number, memType: number = 1): string {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    
    view.setUint8(0, memType);
    view.setUint32(1, address, true); // little-endian address
    view.setUint8(5, length);
    
    const payload = Array.from(new Uint8Array(buffer));
    return this.generateCrtpPacket(4, 1, payload);
  }

  /**
   * Parses the raw byte array of flight data into [x, y, z] float meters
   * @param data The concatenated raw byte array from the drone
   * @returns Array of [X, Y, Z] positions
   */
  static parseFlightData(data: Uint8Array): [number, number, number][] {
    const points: [number, number, number][] = [];
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    // Each point is 6 bytes (int16_t x, int16_t y, int16_t z)
    for (let i = 0; i < data.length; i += 6) {
      if (i + 5 >= data.length) break; // prevent overflow
      
      const xMm = view.getInt16(i, true);
      const yMm = view.getInt16(i + 2, true);
      const zMm = view.getInt16(i + 4, true);
      
      points.push([
        xMm / 1000.0,
        yMm / 1000.0,
        zMm / 1000.0
      ]);
    }
    
    return points;
  }
}
