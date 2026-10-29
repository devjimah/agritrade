import { z } from "zod";
import { CROP_TYPES } from "../types";

export const adjustStockSchema = z.object({
  cropType: z.enum(CROP_TYPES),
  changeBags: z
    .number("Change in bags is required")
    .int("Change must be a whole number of bags")
    .min(-100_000)
    .max(100_000)
    .refine((v) => v !== 0, "Change cannot be zero"),
  reason: z.string().trim().min(3, "Say why the stock changed").max(300),
  idempotencyKey: z.string().min(1).max(100),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
