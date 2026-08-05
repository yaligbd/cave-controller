import { Schema, model, Document } from "mongoose";

export interface UserDoc extends Document {
  email: string;
  passwordHash: string;
}

const userSchema = new Schema<UserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
});

export const User = model<UserDoc>("User", userSchema);
