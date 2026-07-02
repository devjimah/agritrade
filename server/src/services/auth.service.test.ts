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
