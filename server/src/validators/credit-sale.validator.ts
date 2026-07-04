import { z } from "zod";
import { CROP_TYPES, PAYMENT_STATUSES } from "../types";
import { objectIdSchema } from "./farmer.validator";

export const createCreditSaleSchema = z.object({
  customerId: objectIdSchema,
  cropType: z.enum(CROP_TYPES, "Invalid crop type"),
  bagsTaken: z
    .number("Bags taken is required")
    .int("Bags must be a whole number")
    .min(1, "Bags taken must be at least 1")
    .max(100_000, "Bags taken is unrealistically large"),
  // Integer pesewas per bag; the client converts from GHS before sending.
  pricePerBag: z
    .number("Price per bag is required")
    .int("Price must be integer pesewas")
    .min(1, "Price per bag must be positive")
    .max(10_000_000, "Price per bag is unrealistically large"), // 100,000 GHS/bag cap
  idempotencyKey: z.uuid("Invalid idempotency key"),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const listCreditSalesQuerySchema = z.object({
  customerId: objectIdSchema.optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCreditSaleInput = z.infer<typeof createCreditSaleSchema>;
export type ListCreditSalesQuery = z.infer<typeof listCreditSalesQuerySchema>;
