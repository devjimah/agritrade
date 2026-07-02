import mongoose from "mongoose";
import env from "../env";

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
}
