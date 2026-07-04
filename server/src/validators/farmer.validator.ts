import { Types } from "mongoose";
import { z } from "zod";

// Ghanaian numbers are commonly written as 0XXXXXXXXX or +233XXXXXXXXX.
// Normalized to the local 0XXXXXXXXX form so the same number can never be
// stored twice under different formats (duplicate-prevention rule).
// Shared with the customer validator.
export const ghanaPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+233\d{9}|0\d{9})$/, "Phone must be 0XXXXXXXXX or +233XXXXXXXXX")
  .transform((v) => (v.startsWith("+233") ? `0${v.slice(4)}` : v));

const farmerFields = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  phone: ghanaPhoneSchema,
  village: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
});

export const createFarmerSchema = farmerFields.extend({
  village: farmerFields.shape.village.optional().default(""),
  notes: farmerFields.shape.notes.optional().default(""),
});

// No defaults here: an empty update body must fail, not be filled in.
export const updateFarmerSchema = farmerFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const listFarmersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const objectIdSchema = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), "Invalid id");

export type CreateFarmerInput = z.infer<typeof createFarmerSchema>;
export type UpdateFarmerInput = z.infer<typeof updateFarmerSchema>;
export type ListFarmersQuery = z.infer<typeof listFarmersQuerySchema>;
