import { z } from "zod";
import { ghanaPhoneSchema } from "./farmer.validator";

export const farmerLoginSchema = z.object({
  phone: ghanaPhoneSchema,
  pin: z.string().min(1, "PIN is required"),
});

export type FarmerLoginInput = z.infer<typeof farmerLoginSchema>;
