# AgriTrade Milestone 1 — Foundation + Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the AgriTrade monorepo (Express/TS/Mongoose API + React/TS/Tailwind client) with working JWT authentication, protected routes, and a seeded trader user.

**Architecture:** Layered backend (routes → controllers → services → models) with Zod request validation, a global error handler returning a `{ success, data | error }` envelope, and JWT bearer auth. Frontend is Vite + React + React Router with an AuthContext and axios interceptor. Tests: Vitest + Supertest + mongodb-memory-server.

**Tech Stack:** Node 22, Express 5, TypeScript 5, Mongoose 8, bcryptjs, jsonwebtoken, zod, express-rate-limit, helmet, cors; React 18+, Vite, Tailwind CSS v4, shadcn/ui, React Router, axios.

## Global Constraints

- Repo root: `C:\Users\AbrahamJimahZorwi\agritrade` (referred to as `agritrade/`). Backend in `server/`, frontend in `client/`.
- Response envelope everywhere: success → `{ "success": true, "data": {...} }`; error → `{ "success": false, "error": { "message": string, "errors": object[] } }`.
- No public registration endpoint. Users are created only by the seed script in this milestone.
- No Redis, Sentry, sockets, SMS, or mobile money (spec: not MVP).
- All secrets via `.env` (never committed). `.env.example` is committed.
- Windows/PowerShell environment; MongoDB 8.3 runs locally as a service on `mongodb://localhost:27017`.
- Business logic lives in `server/src/services/`, not controllers.
- User roles enum: `"admin" | "staff"`. Seeded user is `admin`.
- API base path: `/api`. Auth routes: `POST /api/auth/login`, `GET /api/auth/me`.
- Commit after every task with a conventional-commit message.

---

### Task 1: Repo scaffold + server tooling

**Files:**
- Create: `.gitignore`, `README.md`
- Create: `server/package.json`, `server/tsconfig.json`, `server/.env`, `server/.env.example`, `server/vitest.config.ts`
- Create: `server/src/env.ts`, `server/src/types/index.ts`

**Interfaces:**
- Produces: `env` object with `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_ORIGIN`; shared types `UserRole`, `IUser`, `AuthRequest`.

- [ ] **Step 1: Root files**

`.gitignore`:
```
node_modules/
dist/
.env
*.local
coverage/
```

`README.md`:
```markdown
# AgriTrade

Digital Credit and Inventory System for Cereal Traders in Ghana.

- `server/` — Express + TypeScript + Mongoose REST API
- `client/` — React + Vite + Tailwind frontend

## Dev setup
1. MongoDB running locally (service) on mongodb://localhost:27017
2. `cd server && npm install && npm run dev`
3. `cd client && npm install && npm run dev`
```

- [ ] **Step 2: server/package.json + install**

```json
{
  "name": "agritrade-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "tsx src/scripts/seed.ts"
  }
}
```

Run:
```powershell
cd C:\Users\AbrahamJimahZorwi\agritrade\server
npm install express mongoose bcryptjs jsonwebtoken zod cors helmet express-rate-limit dotenv
npm install -D typescript tsx vitest supertest mongodb-memory-server @types/express @types/cors @types/jsonwebtoken @types/supertest @types/node
```

- [ ] **Step 3: server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
```

- [ ] **Step 4: env files**

`server/.env` (and `.env.example` with same keys, placeholder secret):
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/agritrade
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=1d
CLIENT_ORIGIN=http://localhost:5173
```

`server/src/env.ts`:
```ts
import { config } from "dotenv";
config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const env = {
  PORT: process.env.PORT ?? "5000",
  MONGODB_URI: required("MONGODB_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "1d",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
};

export default env;
```

Note: tests must not trigger `process.exit` — Task 4+ test setup sets env vars before importing modules.

- [ ] **Step 5: shared types `server/src/types/index.ts`**

```ts
import { Request } from "express";
import { Types } from "mongoose";

export type UserRole = "admin" | "staff";

export interface IUser {
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: { id: Types.ObjectId; role: UserRole };
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd server; npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "chore: scaffold repo and server tooling"
```

---

### Task 2: Express app, error handling, health check

**Files:**
- Create: `server/src/errors/AppError.ts`, `server/src/middleware/error-handler.ts`, `server/src/app.ts`
- Test: `server/src/app.test.ts`

**Interfaces:**
- Produces: `AppError` class (`new AppError(message, statusCode)`), `errorHandler` Express error middleware, `app` (Express instance, no `listen`).
- Consumes: `env` from Task 1.

- [ ] **Step 1: Write failing test `server/src/app.test.ts`**

```ts
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

process.env.MONGODB_URI = "mongodb://localhost:27017/agritrade-test";
process.env.JWT_SECRET = "test-secret";

describe("app", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    app = (await import("./app")).default;
  });

  it("GET /api/health returns success envelope", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: "ok" } });
  });

  it("unknown route returns 404 error envelope", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd server; npx vitest run src/app.test.ts`
Expected: FAIL (cannot find `./app`).

- [ ] **Step 3: Implement**

`server/src/errors/AppError.ts`:
```ts
export class AppError extends Error {
  statusCode: number;
  details: object[];

  constructor(message: string, statusCode = 400, details: object[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
```

`server/src/middleware/error-handler.ts`:
```ts
import { NextFunction, Request, Response } from "express";
import { Error as MongooseError } from "mongoose";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, errors: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof MongooseError.ValidationError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        errors: Object.entries(err.errors).map(([path, e]) => ({ path, message: e.message })),
      },
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: { message: "Internal server error", errors: [] },
  });
}
```

`server/src/app.ts`:
```ts
import cors from "cors";
import express from "express";
import helmet from "helmet";
import env from "./env";
import { errorHandler } from "./middleware/error-handler";
import routes from "./routes";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "100kb" }));

app.use("/api", routes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: "Not found", errors: [] } });
});

app.use(errorHandler);

export default app;
```

`server/src/routes/index.ts` (health only for now):
```ts
import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

export default router;
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd server; npx vitest run src/app.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat(server): express app with error handling and health check"
```

---

### Task 3: MongoDB connection + server entry

**Files:**
- Create: `server/src/config/db.ts`, `server/src/server.ts`

**Interfaces:**
- Produces: `connectDb(): Promise<void>`; running server via `npm run dev`.

- [ ] **Step 1: Implement**

`server/src/config/db.ts`:
```ts
import mongoose from "mongoose";
import env from "../env";

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  await mongoose.connect(uri);
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });
  console.log("Connected to MongoDB");
}
```

`server/src/server.ts`:
```ts
import app from "./app";
import { connectDb } from "./config/db";
import env from "./env";

async function main() {
  await connectDb();
  app.listen(Number(env.PORT), () => {
    console.log(`AgriTrade API running on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify dev server boots**

Run (background): `cd server; npm run dev` then `Invoke-RestMethod http://localhost:5000/api/health`
Expected: `success=True`, `data.status=ok`. Stop the dev server after.

- [ ] **Step 3: Commit**

```powershell
git add -A; git commit -m "feat(server): mongodb connection and server entry"
```

---

### Task 4: User model

**Files:**
- Create: `server/src/models/user.model.ts`, `server/src/tests/setup.ts`
- Test: `server/src/models/user.model.test.ts`

**Interfaces:**
- Produces: `UserModel` (Mongoose model, collection `users`) with fields `fullName`, `email` (unique, lowercase), `passwordHash` (`select: false`), `role` enum, timestamps. `toJSON` never includes `passwordHash`.
- Consumes: `IUser`, `UserRole` from Task 1.

- [ ] **Step 1: Test setup helper `server/src/tests/setup.ts`**

```ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/unused";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

let mongo: MongoMemoryServer | null = null;

export async function setupTestDb(): Promise<void> {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

export async function teardownTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}

export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
```

- [ ] **Step 2: Write failing test `server/src/models/user.model.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { UserModel } from "./user.model";

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearTestDb);

describe("UserModel", () => {
  const valid = {
    fullName: "Ama Trader",
    email: "AMA@example.com",
    passwordHash: "hash",
    role: "admin" as const,
  };

  it("saves a user and lowercases email", async () => {
    const user = await UserModel.create(valid);
    expect(user.email).toBe("ama@example.com");
  });

  it("rejects duplicate emails", async () => {
    await UserModel.create(valid);
    await expect(UserModel.create(valid)).rejects.toThrow();
  });

  it("rejects invalid role", async () => {
    await expect(UserModel.create({ ...valid, role: "boss" as never })).rejects.toThrow();
  });

  it("never serializes passwordHash", async () => {
    const user = await UserModel.create(valid);
    expect(JSON.parse(JSON.stringify(user)).passwordHash).toBeUndefined();
  });

  it("does not select passwordHash by default", async () => {
    await UserModel.create(valid);
    const found = await UserModel.findOne({ email: "ama@example.com" });
    expect(found?.passwordHash).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test, verify fail**

Run: `cd server; npx vitest run src/models/user.model.test.ts`
Expected: FAIL (cannot find `./user.model`).

- [ ] **Step 4: Implement `server/src/models/user.model.ts`**

```ts
import { HydratedDocument, Schema, model } from "mongoose";
import { IUser } from "../types";

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "staff"], required: true, default: "staff" },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export const UserModel = model<IUser>("User", userSchema);
```

Note: duplicate-email test relies on the unique index; `MongoMemoryServer` + `create` triggers it because Mongoose builds indexes automatically in tests (`autoIndex` default true). If flaky, add `await UserModel.init()` in the test's `beforeEach`.

- [ ] **Step 5: Run test, verify pass**

Run: `cd server; npx vitest run src/models/user.model.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat(server): user model with safe serialization"
```

---

### Task 5: Auth service + JWT + auth middleware

**Files:**
- Create: `server/src/services/auth.service.ts`, `server/src/utils/jwt.ts`, `server/src/utils/password.ts`, `server/src/middleware/auth.ts`
- Test: `server/src/services/auth.service.test.ts`, `server/src/middleware/auth.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `comparePassword(plain, hash): Promise<boolean>`
  - `signToken(payload: JwtPayload): string`, `verifyToken(token: string): JwtPayload`
  - `login(email: string, password: string): Promise<{ user: UserDocument; token: string }>` — throws `AppError("Invalid email or password", 401)` on any failure
  - `requireAuth` middleware — sets `req.user = { id, role }` or 401 via `AppError`
- Consumes: `UserModel` (Task 4), `AppError` (Task 2), `env`, `JwtPayload`, `AuthRequest` (Task 1).

- [ ] **Step 1: Write failing service test `server/src/services/auth.service.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { verifyToken } from "../utils/jwt";
import { login } from "./auth.service";
import { AppError } from "../errors/AppError";

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearTestDb);

async function seedUser() {
  return UserModel.create({
    fullName: "Ama Trader",
    email: "ama@example.com",
    passwordHash: await hashPassword("secret123"),
    role: "admin",
  });
}

describe("auth.service login", () => {
  it("returns user and valid token for correct credentials", async () => {
    const seeded = await seedUser();
    const { user, token } = await login("ama@example.com", "secret123");
    expect(user._id.toString()).toBe(seeded._id.toString());
    const payload = verifyToken(token);
    expect(payload.sub).toBe(seeded._id.toString());
    expect(payload.role).toBe("admin");
  });

  it("is case-insensitive on email", async () => {
    await seedUser();
    await expect(login("AMA@example.com", "secret123")).resolves.toBeTruthy();
  });

  it("rejects wrong password with 401", async () => {
    await seedUser();
    await expect(login("ama@example.com", "wrong")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects unknown email with 401 (same message as wrong password)", async () => {
    await expect(login("ghost@example.com", "secret123")).rejects.toThrow(AppError);
    await expect(login("ghost@example.com", "secret123")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password",
    });
  });

  it("returned user JSON does not leak passwordHash", async () => {
    await seedUser();
    const { user } = await login("ama@example.com", "secret123");
    expect(JSON.parse(JSON.stringify(user)).passwordHash).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd server; npx vitest run src/services/auth.service.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`server/src/utils/password.ts`:
```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

`server/src/utils/jwt.ts`:
```ts
import jwt, { SignOptions } from "jsonwebtoken";
import env from "../env";
import { JwtPayload } from "../types";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || !decoded.sub || !decoded.role) {
    throw new Error("Malformed token payload");
  }
  return { sub: decoded.sub, role: decoded.role };
}
```

`server/src/services/auth.service.ts`:
```ts
import { AppError } from "../errors/AppError";
import { UserDocument, UserModel } from "../models/user.model";
import { comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";

const INVALID_CREDENTIALS = () => new AppError("Invalid email or password", 401);

export async function login(
  email: string,
  password: string
): Promise<{ user: UserDocument; token: string }> {
  const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
  if (!user) throw INVALID_CREDENTIALS();

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw INVALID_CREDENTIALS();

  const token = signToken({ sub: user._id.toString(), role: user.role });
  return { user, token };
}
```

- [ ] **Step 4: Run service test, verify pass**

Run: `cd server; npx vitest run src/services/auth.service.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write failing middleware test `server/src/middleware/auth.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { UserModel } from "../models/user.model";
import { signToken } from "../utils/jwt";
import { requireAuth } from "./auth";
import { errorHandler } from "./error-handler";
import { AuthRequest } from "../types";

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearTestDb);

function makeApp() {
  const app = express();
  app.get("/protected", requireAuth, (req, res) => {
    const { user } = req as AuthRequest;
    res.json({ success: true, data: { userId: user!.id.toString(), role: user!.role } });
  });
  app.use(errorHandler);
  return app;
}

async function seedUser() {
  return UserModel.create({
    fullName: "Ama Trader",
    email: "ama@example.com",
    passwordHash: "irrelevant",
    role: "admin",
  });
}

describe("requireAuth", () => {
  it("rejects missing token", async () => {
    const res = await request(makeApp()).get("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects malformed token", async () => {
    const res = await request(makeApp()).get("/protected").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("rejects token for a deleted user", async () => {
    const user = await seedUser();
    const token = signToken({ sub: user._id.toString(), role: "admin" });
    await UserModel.deleteOne({ _id: user._id });
    const res = await request(makeApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("accepts valid token and populates req.user", async () => {
    const user = await seedUser();
    const token = signToken({ sub: user._id.toString(), role: "admin" });
    const res = await request(makeApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ userId: user._id.toString(), role: "admin" });
  });
});
```

- [ ] **Step 6: Run, verify fail**

Run: `cd server; npx vitest run src/middleware/auth.test.ts`
Expected: FAIL (`./auth` not found).

- [ ] **Step 7: Implement `server/src/middleware/auth.ts`**

```ts
import { NextFunction, Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { UserModel } from "../models/user.model";
import { AuthRequest } from "../types";
import { verifyToken } from "../utils/jwt";

export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AppError("Not authenticated", 401);

    let payload;
    try {
      payload = verifyToken(header.slice("Bearer ".length));
    } catch {
      throw new AppError("Not authenticated", 401);
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) throw new AppError("Not authenticated", 401);

    req.user = { id: user._id as Types.ObjectId, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 8: Run all server tests**

Run: `cd server; npx vitest run`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```powershell
git add -A; git commit -m "feat(server): auth service, jwt utils, and auth middleware"
```

---

### Task 6: Auth routes + validation

**Files:**
- Create: `server/src/validators/auth.validator.ts`, `server/src/controllers/auth.controller.ts`, `server/src/routes/auth.route.ts`
- Modify: `server/src/routes/index.ts`
- Test: `server/src/routes/auth.route.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/login` (body `{ email, password }`) → `{ success, data: { user, token } }`; `GET /api/auth/me` (Bearer) → `{ success, data: { user } }`. Login is rate-limited (10/min).
- Consumes: `login` service, `requireAuth`, `AppError`, `UserModel`.

- [ ] **Step 1: Write failing test `server/src/routes/auth.route.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";

let app: import("express").Express;

beforeAll(async () => {
  await setupTestDb();
  app = (await import("../app")).default;
});
afterAll(teardownTestDb);
beforeEach(clearTestDb);

async function seedUser() {
  return UserModel.create({
    fullName: "Ama Trader",
    email: "ama@example.com",
    passwordHash: await hashPassword("secret123"),
    role: "admin",
  });
}

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    await seedUser();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ama@example.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe("ama@example.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("400 on missing fields", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("401 on bad credentials", async () => {
    await seedUser();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ama@example.com", password: "nope" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns current user with valid token", async () => {
    await seedUser();
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "ama@example.com", password: "secret123" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("ama@example.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd server; npx vitest run src/routes/auth.route.test.ts`
Expected: FAIL (404 on /api/auth/login — route not mounted).

- [ ] **Step 3: Implement**

`server/src/validators/auth.validator.ts`:
```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

`server/src/controllers/auth.controller.ts`:
```ts
import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { UserModel } from "../models/user.model";
import { login } from "../services/auth.service";
import { AuthRequest } from "../types";
import { loginSchema } from "../validators/auth.validator";

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { user, token } = await login(email, password);
    res.json({ success: true, data: { user: user.toJSON(), token } });
  } catch (err) {
    next(err);
  }
}

export async function meController(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await UserModel.findById(req.user!.id);
    if (!user) throw new AppError("Not authenticated", 401);
    res.json({ success: true, data: { user: user.toJSON() } });
  } catch (err) {
    next(err);
  }
}
```

`server/src/routes/auth.route.ts`:
```ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginController, meController } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many login attempts, try again later", errors: [] } },
});

router.post("/login", loginLimiter, loginController);
router.get("/me", requireAuth, meController);

export default router;
```

Modify `server/src/routes/index.ts`:
```ts
import { Router } from "express";
import authRoute from "./auth.route";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

router.use("/auth", authRoute);

export default router;
```

- [ ] **Step 4: Run all server tests**

Run: `cd server; npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat(server): login and me endpoints with validation and rate limiting"
```

---

### Task 7: Seed script

**Files:**
- Create: `server/src/scripts/seed.ts`

**Interfaces:**
- Produces: `npm run seed` — idempotently creates admin `admin@agritrade.local` / password `ChangeMe123!` (printed on creation; skipped if exists).

- [ ] **Step 1: Implement `server/src/scripts/seed.ts`**

```ts
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";

const ADMIN_EMAIL = "admin@agritrade.local";
const ADMIN_PASSWORD = "ChangeMe123!";

async function seed() {
  await connectDb();

  const existing = await UserModel.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin user ${ADMIN_EMAIL} already exists — nothing to do.`);
  } else {
    await UserModel.create({
      fullName: "AgriTrade Admin",
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: "admin",
    });
    console.log(`Created admin user ${ADMIN_EMAIL} with password: ${ADMIN_PASSWORD}`);
    console.log("Change this password before deploying anywhere public.");
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run and verify**

Run: `cd server; npm run seed` (twice)
Expected: first run "Created admin user...", second run "already exists".

- [ ] **Step 3: Verify login end-to-end against real MongoDB**

Start dev server, then:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/login -ContentType "application/json" -Body '{"email":"admin@agritrade.local","password":"ChangeMe123!"}'
```
Expected: `success=True` with token. Stop dev server.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "feat(server): idempotent admin seed script"
```

---

### Task 8: Client scaffold (Vite + React + TS + Tailwind + shadcn + Router)

**Files:**
- Create: `client/` via Vite scaffold; `client/.env.development`; Tailwind + shadcn config; `client/src/lib/utils.ts` (shadcn)

**Interfaces:**
- Produces: running Vite dev server on `http://localhost:5173` with Tailwind working and shadcn `Button`, `Input`, `Card`, `Label` components installed.

- [ ] **Step 1: Scaffold**

```powershell
cd C:\Users\AbrahamJimahZorwi\agritrade
npm create vite@latest client -- --template react-ts
cd client
npm install
npm install react-router-dom axios
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Tailwind v4 wiring**

Replace `client/src/index.css` content with:
```css
@import "tailwindcss";
```

`client/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Add to `client/tsconfig.json` and `client/tsconfig.app.json` `compilerOptions`:
```json
{
  "baseUrl": ".",
  "paths": { "@/*": ["./src/*"] }
}
```

- [ ] **Step 3: shadcn init + components**

```powershell
npx shadcn@latest init -y
npx shadcn@latest add button input card label
```
If the CLI prompts interactively or fails, fall back to creating `client/src/lib/utils.ts` (`cn` helper with `clsx` + `tailwind-merge`) and vendoring the four component files from ui.shadcn.com manually.

- [ ] **Step 4: Env**

`client/.env.development`:
```
VITE_API_URL=http://localhost:5000/api
```

- [ ] **Step 5: Verify**

Run: `cd client; npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat(client): vite react scaffold with tailwind and shadcn"
```

---

### Task 9: Client auth (API service, context, login page, protected routes)

**Files:**
- Create: `client/src/services/api.ts`, `client/src/services/auth.ts`, `client/src/context/AuthContext.tsx`, `client/src/pages/LoginPage.tsx`, `client/src/pages/DashboardPage.tsx`, `client/src/components/ProtectedRoute.tsx`, `client/src/layouts/AppLayout.tsx`
- Modify: `client/src/App.tsx`, `client/src/main.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `GET /api/auth/me` (Task 6 envelope shapes).
- Produces: `useAuth()` → `{ user, loading, login(email, password), logout() }`; token persisted in `localStorage` key `agritrade_token`.

- [ ] **Step 1: API client `client/src/services/api.ts`**

```ts
import axios from "axios";

export const TOKEN_KEY = "agritrade_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error?.message ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}
```

- [ ] **Step 2: Auth service `client/src/services/auth.ts`**

```ts
import { api, TOKEN_KEY } from "./api";

export interface User {
  _id: string;
  fullName: string;
  email: string;
  role: "admin" | "staff";
}

export async function loginRequest(email: string, password: string): Promise<User> {
  const res = await api.post("/auth/login", { email, password });
  const { user, token } = res.data.data as { user: User; token: string };
  localStorage.setItem(TOKEN_KEY, token);
  return user;
}

export async function fetchMe(): Promise<User> {
  const res = await api.get("/auth/me");
  return res.data.data.user as User;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}
```

- [ ] **Step 3: Context `client/src/context/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, clearToken, fetchMe, hasToken, loginRequest } from "@/services/auth";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const loggedIn = await loginRequest(email, password);
    setUser(loggedIn);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: ProtectedRoute `client/src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
```

- [ ] **Step 5: Login page `client/src/pages/LoginPage.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">AgriTrade</CardTitle>
          <CardDescription>Sign in to manage your trading records</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Layout + dashboard placeholder**

`client/src/layouts/AppLayout.tsx`:
```tsx
import { Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">AgriTrade</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user?.fullName}</span>
          <Button variant="outline" size="sm" onClick={logout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

`client/src/pages/DashboardPage.tsx`:
```tsx
export function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <p className="mt-2 text-muted-foreground">
        Welcome to AgriTrade. Farmer, customer, and inventory modules arrive in the next milestones.
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Wire router**

`client/src/App.tsx`:
```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/layouts/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

`client/src/main.tsx` — keep Vite default but ensure it imports `./index.css` and renders `<App />`.

- [ ] **Step 8: Verify build + typecheck**

Run: `cd client; npm run build`
Expected: success.

- [ ] **Step 9: Commit**

```powershell
git add -A; git commit -m "feat(client): auth context, login page, and protected routing"
```

---

### Task 10: End-to-end smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Start both servers** (background): `cd server; npm run dev` and `cd client; npm run dev`

- [ ] **Step 2: Browser smoke test** (agent-browser skill or manual):
  1. Open `http://localhost:5173` → redirected to `/login`.
  2. Login with wrong password → error message shown.
  3. Login `admin@agritrade.local` / `ChangeMe123!` → dashboard with header showing "AgriTrade Admin".
  4. Reload page → still authenticated (token persisted, `/me` fetch works).
  5. Log out → back to `/login`; visiting `/` redirects to `/login`.

- [ ] **Step 3: Stop servers, run full server test suite once more**

Run: `cd server; npx vitest run`
Expected: all pass.

- [ ] **Step 4: Commit any fixes**

```powershell
git add -A; git commit -m "test: end-to-end auth smoke verification fixes"
```
