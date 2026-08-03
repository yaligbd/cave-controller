import { Device } from "react-native-ble-plx";

const NOT_IMPLEMENTED = new Error(
  "Over-the-air flashing is not implemented yet. Flash the drone from a PC using a Crazyradio.",
);

export class OtaService {
  static async sendPacket(device: Device, byteArray: number[]) {
    throw NOT_IMPLEMENTED;
  }

  static async rebootToBootloader(device: Device) {
    throw NOT_IMPLEMENTED;
  }

  static async readFirmwareFile(): Promise<Uint8Array> {
    throw NOT_IMPLEMENTED;
  }

  static async uploadFirmwareChunks(
    device: Device,
    fwBytes: Uint8Array,
    progressCallback: (p: number) => void,
  ) {
    throw NOT_IMPLEMENTED;
  }

  static async rebootToFirmware(device: Device) {
    throw NOT_IMPLEMENTED;
  }
}
