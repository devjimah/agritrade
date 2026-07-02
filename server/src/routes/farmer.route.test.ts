import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { FarmerModel } from "../models/farmer.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

let app: import("express").Express;
let token: string;

beforeAll(async () => {
  await setupTestDb();
  app = (await import("../app")).default;
});
afterAll(teardownTestDb);

beforeEach(async () => {
  await clearTestDb();
  // Sign the token directly instead of calling /login: the login rate limiter
  // is shared across tests and would throttle per-test logins.
  const user = await UserModel.create({
    fullName: "Ama Trader",
    email: "ama@example.com",
    passwordHash: await hashPassword("secret123"),
    role: "admin",
  });
  token = signToken({ sub: user._id.toString(), role: user.role });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

const validFarmer = {
  fullName: "Kofi Mensah",
  phone: "0244123456",
  village: "Techiman",
  notes: "Maize farmer",
};

describe("POST /api/farmers", () => {
  it("creates a farmer", async () => {
    const res = await request(app).post("/api/farmers").set(auth()).send(validFarmer);
    expect(res.status).toBe(201);
    expect(res.body.data.farmer.fullName).toBe("Kofi Mensah");
    expect(res.body.data.farmer.phone).toBe("0244123456");
  });

  it("401 without token", async () => {
    const res = await request(app).post("/api/farmers").send(validFarmer);
    expect(res.status).toBe(401);
  });

  it("400 on invalid phone", async () => {
    const res = await request(app)
      .post("/api/farmers")
      .set(auth())
      .send({ ...validFarmer, phone: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.error.errors[0].path).toBe("phone");
  });

  it("409 on duplicate phone", async () => {
    await request(app).post("/api/farmers").set(auth()).send(validFarmer);
    const res = await request(app)
      .post("/api/farmers")
      .set(auth())
      .send({ ...validFarmer, fullName: "Different Name" });
    expect(res.status).toBe(409);
  });

  it("normalizes +233 format to local format", async () => {
    const res = await request(app)
      .post("/api/farmers")
      .set(auth())
      .send({ ...validFarmer, phone: "+233244123456" });
    expect(res.status).toBe(201);
    expect(res.body.data.farmer.phone).toBe("0244123456");
  });

  it("409 on duplicate phone written in a different format", async () => {
    await request(app).post("/api/farmers").set(auth()).send(validFarmer);
    const res = await request(app)
      .post("/api/farmers")
      .set(auth())
      .send({ fullName: "Same Person", phone: "+233244123456" });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/farmers/:id", () => {
  it("is not exposed: farmers with financial history must never be deletable", async () => {
    const farmer = await FarmerModel.create(validFarmer);
    const res = await request(app).delete(`/api/farmers/${farmer._id}`).set(auth());
    expect(res.status).toBe(404);
  });
});

describe("GET /api/farmers", () => {
  it("lists farmers with pagination metadata", async () => {
    await FarmerModel.create(validFarmer);
    await FarmerModel.create({ fullName: "Abena Osei", phone: "0201112222" });
    const res = await request(app).get("/api/farmers").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.farmers).toHaveLength(2);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.pages).toBe(1);
  });

  it("filters by name search, case-insensitive", async () => {
    await FarmerModel.create(validFarmer);
    await FarmerModel.create({ fullName: "Abena Osei", phone: "0201112222" });
    const res = await request(app).get("/api/farmers?search=kofi").set(auth());
    expect(res.body.data.farmers).toHaveLength(1);
    expect(res.body.data.farmers[0].fullName).toBe("Kofi Mensah");
  });

  it("filters by phone search", async () => {
    await FarmerModel.create(validFarmer);
    await FarmerModel.create({ fullName: "Abena Osei", phone: "0201112222" });
    const res = await request(app).get("/api/farmers?search=020111").set(auth());
    expect(res.body.data.farmers).toHaveLength(1);
    expect(res.body.data.farmers[0].fullName).toBe("Abena Osei");
  });

  it("does not treat regex metacharacters in search as patterns", async () => {
    await FarmerModel.create(validFarmer);
    const res = await request(app).get("/api/farmers?search=.*").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.farmers).toHaveLength(0);
  });

  it("paginates", async () => {
    for (let i = 0; i < 3; i++) {
      await FarmerModel.create({ fullName: `Farmer ${i}`, phone: `024400000${i}` });
    }
    const res = await request(app).get("/api/farmers?page=2&limit=2").set(auth());
    expect(res.body.data.farmers).toHaveLength(1);
    expect(res.body.data.pages).toBe(2);
  });
});

describe("GET /api/farmers/:id", () => {
  it("returns a farmer", async () => {
    const farmer = await FarmerModel.create(validFarmer);
    const res = await request(app).get(`/api/farmers/${farmer._id}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.farmer.fullName).toBe("Kofi Mensah");
  });

  it("404 on missing farmer", async () => {
    const res = await request(app).get("/api/farmers/64b000000000000000000000").set(auth());
    expect(res.status).toBe(404);
  });

  it("400 on malformed id", async () => {
    const res = await request(app).get("/api/farmers/not-an-id").set(auth());
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/farmers/:id", () => {
  it("updates fields", async () => {
    const farmer = await FarmerModel.create(validFarmer);
    const res = await request(app)
      .put(`/api/farmers/${farmer._id}`)
      .set(auth())
      .send({ village: "Wenchi" });
    expect(res.status).toBe(200);
    expect(res.body.data.farmer.village).toBe("Wenchi");
    expect(res.body.data.farmer.fullName).toBe("Kofi Mensah");
  });

  it("400 on empty body", async () => {
    const farmer = await FarmerModel.create(validFarmer);
    const res = await request(app).put(`/api/farmers/${farmer._id}`).set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it("409 when changing phone to another farmer's", async () => {
    const farmer = await FarmerModel.create(validFarmer);
    await FarmerModel.create({ fullName: "Abena Osei", phone: "0201112222" });
    const res = await request(app)
      .put(`/api/farmers/${farmer._id}`)
      .set(auth())
      .send({ phone: "0201112222" });
    expect(res.status).toBe(409);
  });

  it("allows keeping own phone", async () => {
    const farmer = await FarmerModel.create(validFarmer);
    const res = await request(app)
      .put(`/api/farmers/${farmer._id}`)
      .set(auth())
      .send({ phone: validFarmer.phone, village: "Wenchi" });
    expect(res.status).toBe(200);
  });

  it("404 on missing farmer", async () => {
    const res = await request(app)
      .put("/api/farmers/64b000000000000000000000")
      .set(auth())
      .send({ village: "Wenchi" });
    expect(res.status).toBe(404);
  });
});
