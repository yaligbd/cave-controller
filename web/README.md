# CaveBat Web

Companion web app for CaveBat: account signup/login and APK download for the
mobile app. Node.js + TypeScript + Express + MongoDB (Mongoose), with a plain
HTML/CSS/JS frontend served statically by Express.

## Local development

```bash
cd web
npm install
cp .env.example .env   # edit values if needed
npm run dev             # runs src/server.ts directly via ts-node-dev
```

Requires a MongoDB instance reachable at `MONGODB_URI` (a local `mongod` on
`mongodb://localhost:27017/cavebat` works for development).

To run the production build locally:

```bash
npm run build   # tsc -> dist/
npm start        # node dist/server.js
```

The app is served at `http://localhost:4000` (or whatever `PORT` is set to).

## API

| Method | Path             | Auth   | Body / Notes                          |
|--------|------------------|--------|----------------------------------------|
| POST   | `/api/register`  | none   | `{ email, password }` -> `{ token }`  |
| POST   | `/api/login`     | none   | `{ email, password }` -> `{ token }`  |
| GET    | `/api/version`   | none   | `{ version, releaseNotes, apkUrl }`   |
| GET    | `/api/download`  | Bearer | `{ apkUrl }`; 401 without a valid JWT |

## Environment variables

See `.env.example`:

- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — secret used to sign/verify JWTs
- `PORT` — port Express listens on (Render sets this automatically)

## Deploying to Render

1. Push this repo to GitHub/GitLab and create a new **Web Service** on Render
   pointed at it, with **Root Directory** set to `web`.
2. Render settings:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
3. Add the three environment variables under the service's *Environment* tab:
   - `MONGODB_URI` — your Atlas connection string (see below)
   - `JWT_SECRET` — a long random string
   - `PORT` — Render provides this automatically; you don't need to set it
     yourself, but the app reads it if present.
4. Deploy. On first boot the server seeds a single placeholder `Version`
   document if the collection is empty — update it directly in Atlas (or via
   a script) once you have a real APK URL to publish.

## MongoDB Atlas

This app is intended to run against a free-tier **MongoDB Atlas** cluster.

- Create a free cluster, a database user, and copy the connection string into
  `MONGODB_URI`.
- Under **Network Access**, add `0.0.0.0/0` to the IP access list — Render's
  outbound IPs aren't static on the free plan, so Atlas must allow connections
  from anywhere for the deployed service to reach the database.
