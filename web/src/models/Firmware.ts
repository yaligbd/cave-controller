import { Schema, model, Document } from "mongoose";

export interface FirmwareDoc extends Document {
  version: string;
  url: string;
  notes: string;
  createdAt: Date;
}

const firmwareSchema = new Schema<FirmwareDoc>({
  version: { type: String, required: true },
  url: { type: String, required: true },
  notes: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Firmware = model<FirmwareDoc>("Firmware", firmwareSchema);
