import mongoose from "mongoose";
import app from "./app";
import { connectDb } from "./config/db";
import env from "./env";

async function main() {
  await connectDb();
  const server = app.listen(Number(env.PORT), () => {
    console.log(`AgriTrade API running on http://localhost:${env.PORT}`);
  });

  // Close cleanly on Ctrl+C / termination so watchers (tsx watch) don't hang
  // waiting for the child to exit. Force-exit if closing takes too long.
  const shutdown = () => {
    server.close();
    mongoose.disconnect().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
