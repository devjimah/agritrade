import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/unused";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-test-secret-test-secret-1234";

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
