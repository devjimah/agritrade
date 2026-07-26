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

  it("rejects a farmer-scoped token", async () => {
    const user = await seedUser();
    const token = signToken({ sub: user._id.toString(), scope: "farmer" });
    const res = await request(makeApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
