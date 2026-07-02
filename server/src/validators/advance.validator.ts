import { z } from "zod";
import { CROP_TYPES, REPAYMENT_STATUSES } from "../types";
import { objectIdSchema } from "./farmer.validator";

export const createAdvanceSchema = z.object({
  farmerId: objectIdSchema,
  // Integer pesewas (GHS x 100). The client converts from GHS before sending.
  amountGiven: z
    .number("Amount is required")
    .int("Amount must be integer pesewas")
    .min(1, "Amount must be positive")
    .max(100_000_000, "Amount is unrealistically large"), // 1,000,000 GHS cap
  cropType: z.enum(CROP_TYPES, "Invalid crop type"),
  expectedBags: z
    .number("Expected bags is required")
    .int("Expected bags must be a whole number")
    .min(1, "Expected bags must be at least 1")
    .max(100_000, "Expected bags is unrealistically large"),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const listAdvancesQuerySchema = z.object({
  farmerId: objectIdSchema.optional(),
  repaymentStatus: z.enum(REPAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;
export type ListAdvancesQuery = z.infer<typeof listAdvancesQuerySchema>;
