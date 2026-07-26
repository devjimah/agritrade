import { AppError } from "../errors/AppError";
import { FarmerModel } from "../models/farmer.model";
import { comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";

const INVALID_CREDENTIALS = () => new AppError("Invalid phone number or PIN", 401);

// bcrypt hash of a random unused PIN; compared against when the phone is
// unknown, or when the farmer has no pinHash set yet, so those paths take as
// long as a real wrong-PIN compare (timing oracle prevention — see
// auth.service.ts's DUMMY_HASH for the same reasoning).
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function loginFarmer(phone: string, pin: string): Promise<{ token: string }> {
  const farmer = await FarmerModel.findOne({ phone }).select("+pinHash");
  if (!farmer || !farmer.pinHash) {
    await comparePassword(pin, DUMMY_HASH);
    throw INVALID_CREDENTIALS();
  }

  const valid = await comparePassword(pin, farmer.pinHash);
  if (!valid) throw INVALID_CREDENTIALS();

  const token = signToken({ sub: farmer._id.toString(), scope: "farmer" });
  return { token };
}
