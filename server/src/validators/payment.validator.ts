import { z } from "zod";
import { PAYMENT_METHODS } from "../types";
import { objectIdSchema } from "./farmer.validator";

export const createPaymentSchema = z.object({
  creditSaleId: objectIdSchema,
  // Integer pesewas; the client converts from GHS before sending.
  amountPaid: z
    .number("Amount is required")
    .int("Amount must be integer pesewas")
    .min(1, "Amount must be positive")
    .max(1_000_000_000_000, "Amount is unrealistically large"),
  paymentMethod: z.enum(PAYMENT_METHODS, "Invalid payment method"),
  idempotencyKey: z.uuid("Invalid idempotency key"),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const listPaymentsQuerySchema = z.object({
  creditSaleId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
