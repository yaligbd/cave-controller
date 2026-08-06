import { Schema, model, Document } from "mongoose";

export interface UserDoc extends Document {
  email: string;
  passwordHash: string;
  onboardingStep: number;
}

const userSchema = new Schema<UserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  onboardingStep: { type: Number, default: 0 },
});

export const User = model<UserDoc>("User", userSchema);
