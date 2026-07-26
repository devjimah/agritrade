import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerModel } from "../models/farmer.model";
import { hashPassword } from "../utils/password";

let app: import("express").Express;

beforeAll(async () => {
  await setupTestDb();
  app = (await import("../app")).default;
});
afterAll(teardownTestDb);
beforeEach(clearTestDb);

const validFarmer = {
  fullName: "Kofi Mensah",
  phone: "0244123456",
  village: "Techiman",
  notes: "Maize farmer",
};

async function seedFarmerWithPin(pin = "1234") {
  return FarmerModel.create({ ...validFarmer, pinHash: await hashPassword(pin) });
}

describe("POST /api/farmer-portal/login", () => {
  it("logs in with a valid phone and PIN", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
  });

  it("normalizes +233 format on login", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "+233244123456", pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it("401 on wrong PIN", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "9999" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid phone number or PIN");
  });

  it("401 on unknown phone, same message as wrong PIN", async () => {
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0200000000", pin: "1234" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid phone number or PIN");
  });

  it("401 when farmer exists but has no PIN set yet, same message", async () => {
    await FarmerModel.create(validFarmer);
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "1234" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid phone number or PIN");
  });

  it("never returns the pinHash", async () => {
    await seedFarmerWithPin();
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456", pin: "1234" });
    expect(JSON.stringify(res.body)).not.toContain("pinHash");
  });

  it("400 on malformed body", async () => {
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "not-a-phone", pin: "1234" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("400 when pin is missing", async () => {
    const res = await request(app)
      .post("/api/farmer-portal/login")
      .send({ phone: "0244123456" });
    expect(res.status).toBe(400);
  });
});
