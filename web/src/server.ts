import "dotenv/config";
import path from "path";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { User } from "./models/User";
import { Version } from "./models/Version";
import { requireAuth } from "./middleware/auth";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/cavebat";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: email.toLowerCase(), passwordHash });

    return res.status(201).json({ token: signToken(user.id) });
  } catch (err) {
    return res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({ token: signToken(user.id) });
  } catch (err) {
    return res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/version", async (_req, res) => {
  try {
    const latest = await Version.findOne().sort({ createdAt: -1 });
    if (!latest) {
      return res.status(404).json({ error: "No version published yet" });
    }
    return res.json({
      version: latest.version,
      releaseNotes: latest.releaseNotes,
      apkUrl: latest.apkUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not load version info" });
  }
});

app.get("/api/download", requireAuth, async (_req, res) => {
  try {
    const latest = await Version.findOne().sort({ createdAt: -1 });
    if (!latest) {
      return res.status(404).json({ error: "No build available yet" });
    }
    return res.json({ apkUrl: latest.apkUrl });
  } catch (err) {
    return res.status(500).json({ error: "Could not load download link" });
  }
});

async function seedVersionIfEmpty() {
  const count = await Version.countDocuments();
  if (count === 0) {
    await Version.create({
      version: "1.0.0",
      releaseNotes: "Initial CaveBat release.",
      apkUrl: "https://example.com/cavebat-1.0.0.apk",
    });
    console.log("Seeded initial Version document");
  }
}

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  await seedVersionIfEmpty();

  app.listen(PORT, () => {
    console.log(`CaveBat web server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
