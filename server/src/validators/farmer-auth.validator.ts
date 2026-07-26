import { z } from "zod";
import { ghanaPhoneSchema } from "./farmer.validator";

export const farmerLoginSchema = z.object({
  phone: ghanaPhoneSchema,
  // INTENTIONALLY loose — do NOT tighten to /^\d{4,6}$/. A format check here
  // rejects malformed PINs with 400 while wrong-but-well-formed ones get 401,
  // handing an attacker an oracle for the real PIN's shape. Only the max is
  // enforced, to bound bcrypt work on absurd input.
  pin: z.string().min(1, "PIN is required").max(200),
});

export type FarmerLoginInput = z.infer<typeof farmerLoginSchema>;
