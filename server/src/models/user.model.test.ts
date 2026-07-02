import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { UserModel } from "./user.model";

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(async () => {
  await clearTestDb();
  await UserModel.init();
});

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
