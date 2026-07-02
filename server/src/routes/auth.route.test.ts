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
