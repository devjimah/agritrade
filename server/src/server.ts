import app from "./app";
import { connectDb } from "./config/db";
import env from "./env";

async function main() {
  await connectDb();
  app.listen(Number(env.PORT), () => {
    console.log(`AgriTrade API running on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
