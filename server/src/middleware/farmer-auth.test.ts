import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerModel } from "../models/farmer.model";
import { signToken } from "../utils/jwt";
import { requireFarmerAuth } from "./farmer-auth";
import { errorHandler } from "./error-handler";
import { AuthRequest } from "../types";

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearTestDb);

function makeApp() {
  const app = express();
  app.get("/protected", requireFarmerAuth, (req, res) => {
    const { farmer } = req as AuthRequest;
    res.json({ success: true, data: { farmerId: farmer!.id.toString() } });
  });
  app.use(errorHandler);
  return app;
}

async function seedFarmer() {
  return FarmerModel.create({
    fullName: "Kofi Farmer",
    phone: "0551234567",
  });
}

describe("requireFarmerAuth", () => {
  it("rejects missing token", async () => {
    const res = await request(makeApp()).get("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects malformed token", async () => {
    const res = await request(makeApp()).get("/protected").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("rejects a staff-scoped token", async () => {
    const farmer = await seedFarmer();
    const token = signToken({ sub: farmer._id.toString(), role: "admin" });
    const res = await request(makeApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects token for a deleted farmer", async () => {
    const farmer = await seedFarmer();
    const token = signToken({ sub: farmer._id.toString(), scope: "farmer" });
    await FarmerModel.deleteOne({ _id: farmer._id });
    const res = await request(makeApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("accepts valid farmer token and populates req.farmer", async () => {
    const farmer = await seedFarmer();
    const token = signToken({ sub: farmer._id.toString(), scope: "farmer" });
    const res = await request(makeApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ farmerId: farmer._id.toString() });
  });
});
