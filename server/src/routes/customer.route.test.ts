import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { CustomerModel } from "../models/customer.model";
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
  const user = await UserModel.create({
    fullName: "Ama Trader",
    email: "ama@example.com",
    passwordHash: await hashPassword("secret123"),
    role: "admin",
  });
  token = signToken({ sub: user._id.toString(), role: user.role });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

const validCustomer = {
  fullName: "Yaw Boateng",
  phone: "0551234567",
  location: "Kumasi Central Market",
  notes: "Buys maize in bulk",
};

describe("POST /api/customers", () => {
  it("creates a customer", async () => {
    const res = await request(app).post("/api/customers").set(auth()).send(validCustomer);
    expect(res.status).toBe(201);
    expect(res.body.data.customer.fullName).toBe("Yaw Boateng");
  });

  it("401 without token", async () => {
    const res = await request(app).post("/api/customers").send(validCustomer);
    expect(res.status).toBe(401);
  });

  it("normalizes +233 phone and rejects cross-format duplicates", async () => {
    const first = await request(app)
      .post("/api/customers")
      .set(auth())
      .send({ ...validCustomer, phone: "+233551234567" });
    expect(first.status).toBe(201);
    expect(first.body.data.customer.phone).toBe("0551234567");

    const dup = await request(app)
      .post("/api/customers")
      .set(auth())
      .send({ ...validCustomer, fullName: "Different Name", phone: "0551234567" });
    expect(dup.status).toBe(409);
  });

  it("400 on invalid phone", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set(auth())
      .send({ ...validCustomer, phone: "12345" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/customers", () => {
  it("lists with pagination metadata and searches by name", async () => {
    await CustomerModel.create(validCustomer);
    await CustomerModel.create({ fullName: "Esi Amankwah", phone: "0209998888" });
    const all = await request(app).get("/api/customers").set(auth());
    expect(all.body.data.total).toBe(2);

    const filtered = await request(app).get("/api/customers?search=esi").set(auth());
    expect(filtered.body.data.customers).toHaveLength(1);
    expect(filtered.body.data.customers[0].fullName).toBe("Esi Amankwah");
  });

  it("escapes regex metacharacters in search", async () => {
    await CustomerModel.create(validCustomer);
    const res = await request(app).get("/api/customers?search=.*").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.customers).toHaveLength(0);
  });
});

describe("GET/PUT /api/customers/:id", () => {
  it("returns and updates a customer", async () => {
    const customer = await CustomerModel.create(validCustomer);
    const got = await request(app).get(`/api/customers/${customer._id}`).set(auth());
    expect(got.status).toBe(200);

    const updated = await request(app)
      .put(`/api/customers/${customer._id}`)
      .set(auth())
      .send({ location: "Techiman Market" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.customer.location).toBe("Techiman Market");
    expect(updated.body.data.customer.fullName).toBe("Yaw Boateng");
  });

  it("400 on empty update body", async () => {
    const customer = await CustomerModel.create(validCustomer);
    const res = await request(app).put(`/api/customers/${customer._id}`).set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it("409 when changing phone to another customer's", async () => {
    const customer = await CustomerModel.create(validCustomer);
    await CustomerModel.create({ fullName: "Esi Amankwah", phone: "0209998888" });
    const res = await request(app)
      .put(`/api/customers/${customer._id}`)
      .set(auth())
      .send({ phone: "0209998888" });
    expect(res.status).toBe(409);
  });

  it("404 on missing customer", async () => {
    const res = await request(app).get("/api/customers/64b000000000000000000000").set(auth());
    expect(res.status).toBe(404);
  });
});

describe("customer immutability of the delete kind", () => {
  it("DELETE is not exposed: customers with debt history must never be deletable", async () => {
    const customer = await CustomerModel.create(validCustomer);
    const res = await request(app).delete(`/api/customers/${customer._id}`).set(auth());
    expect(res.status).toBe(404);
  });
});
