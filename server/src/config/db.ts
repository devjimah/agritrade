import mongoose from "mongoose";
import env from "../env";

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  await mongoose.connect(uri);
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });
  console.log("Connected to MongoDB");
}
