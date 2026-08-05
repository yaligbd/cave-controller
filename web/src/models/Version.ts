import { Schema, model, Document } from "mongoose";

export interface VersionDoc extends Document {
  version: string;
  releaseNotes: string;
  apkUrl: string;
  createdAt: Date;
}

const versionSchema = new Schema<VersionDoc>({
  version: { type: String, required: true },
  releaseNotes: { type: String, required: true },
  apkUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Version = model<VersionDoc>("Version", versionSchema);
