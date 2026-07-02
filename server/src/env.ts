import { config } from "dotenv";
config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

const env = {
  PORT: process.env.PORT ?? "5000",
  MONGODB_URI: required("MONGODB_URI"),
  JWT_SECRET: jwtSecret,
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "1d",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
};

export default env;
