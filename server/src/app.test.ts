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
