import mongoose from "mongoose";
import env from "../env";

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  // Financial services use multi-document transactions, which MongoDB only
  // supports on replica sets (Atlas is one by default). Surface that at
  // startup instead of with a cryptic per-request 500 on the first advance:
  // exit in production, warn in development.
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
  if (!hello?.setName) {
    const message =
      "MongoDB is not a replica set — financial operations (advances, sales, payments) " +
      "will fail. For local dev run: mongod --replSet rs0  then  mongosh --eval 'rs.initiate()'";
    if (env.NODE_ENV === "production") {
      console.error(`FATAL: ${message}`);
      process.exit(1);
    }
    console.warn(`WARNING: ${message}`);
  }
}
