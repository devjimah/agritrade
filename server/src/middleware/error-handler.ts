import { NextFunction, Request, Response } from "express";
import { Error as MongooseError } from "mongoose";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, errors: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof MongooseError.ValidationError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        errors: Object.entries(err.errors).map(([path, e]) => ({ path, message: e.message })),
      },
    });
    return;
  }

  if (err instanceof MongooseError.CastError) {
    res.status(400).json({
      success: false,
      error: { message: `Invalid value for ${err.path}`, errors: [] },
    });
    return;
  }

  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    res.status(409).json({
      success: false,
      error: { message: "A record with these details already exists", errors: [] },
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: { message: "Internal server error", errors: [] },
  });
}
