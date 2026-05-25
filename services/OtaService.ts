import { Buffer } from "buffer";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { Device } from "react-native-ble-plx";
import {
  CRAZYFLIE_RX,
  CRAZYFLIE_SERVICE,
} from "../contexts/DroneConnectionContext";

export class OtaService {
  static async sendPacket(device: Device, byteArray: number[]) {
    try {
      const base64Data = Buffer.from(byteArray).toString("base64");
      await device.writeCharacteristicWithoutResponseForService(
        CRAZYFLIE_SERVICE,
        CRAZYFLIE_RX,
        base64Data,
      );
    } catch (error) {
      console.error("❌ Failed to send packet:", error);
      throw error;
    }
  }

  static async rebootToBootloader(device: Device) {
    console.log("🔄 Sending reboot-to-bootloader command...");
    // Port 13, Channel 0 (System) -> Command 0xFF (Reboot to bootloader)
    await this.sendPacket(device, [0xd0, 0xff]);
  }

  // --- NEW: Real File Reading ---
  static async readFirmwareFile(): Promise<Uint8Array> {
    console.log("📂 Loading firmware file from assets...");

    // 1. Tell Expo to find our bundled .bin file
    // Change this line:
    const asset = Asset.fromModule(
      require("../assets/firmware/app_wall_follower.c"),
    );
    await asset.downloadAsync();

    // 2. Read the raw file data using the native FileSystem
    const base64String = await FileSystem.readAsStringAsync(asset.localUri!, {
      encoding: "base64",
    });

    // 3. Convert it into a raw array of bytes
    const binaryBuffer = Buffer.from(base64String, "base64");
    console.log(`✅ Loaded ${binaryBuffer.length} bytes of firmware!`);

    return new Uint8Array(binaryBuffer);
  }

  // --- NEW: The Chunking Algorithm ---
  static async uploadFirmwareChunks(
    device: Device,
    fwBytes: Uint8Array,
    progressCallback: (p: number) => void,
  ) {
    console.log("🚀 Starting chunked firmware upload...");

    // BLE is limited. We can only safely send about 16-18 bytes of payload per packet
    const CHUNK_SIZE = 16;

    for (let i = 0; i < fwBytes.length; i += CHUNK_SIZE) {
      // 1. Slice out a tiny piece of the file
      const chunk = Array.from(fwBytes.slice(i, i + CHUNK_SIZE));

      // 2. Wrap it in a CRTP Header for Port 4 (Memory Subsystem)
      // (Note: A true bootloader flash requires specific memory addressing headers here)
      const crtpPacket = [0x40, ...chunk];

      // 3. Fire it at the drone
      await this.sendPacket(device, crtpPacket);

      // 4. Calculate exactly how far along we are and update the UI!
      const progress = ((i + chunk.length) / fwBytes.length) * 100;
      progressCallback(progress);

      // 5. CRITICAL: We MUST pause for a few milliseconds!
      // If we don't, the phone will fire packets faster than the drone's radio can process them, crashing the connection.
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    console.log("✅ Firmware upload complete!");
  }

  static async rebootToFirmware(device: Device) {
    console.log("🔄 Rebooting to new firmware...");
    // Sending a fake reboot command for now to close the loop
    await this.sendPacket(device, [0xd0, 0x00]);
  }
}
