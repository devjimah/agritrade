import jwt, { SignOptions } from "jsonwebtoken";
import env from "../env";
import { JwtPayload, UserRole } from "../types";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !decoded.sub || !decoded.role) {
    throw new Error("Malformed token payload");
  }
  return { sub: decoded.sub, role: decoded.role as UserRole };
}
