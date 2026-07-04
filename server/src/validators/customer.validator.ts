import { z } from "zod";
import { ghanaPhoneSchema } from "./farmer.validator";

const customerFields = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  phone: ghanaPhoneSchema,
  location: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
});

export const createCustomerSchema = customerFields.extend({
  location: customerFields.shape.location.optional().default(""),
  notes: customerFields.shape.notes.optional().default(""),
});

// No defaults here: an empty update body must fail, not be filled in.
export const updateCustomerSchema = customerFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
