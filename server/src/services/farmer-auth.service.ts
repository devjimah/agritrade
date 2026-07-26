import { AppError } from "../errors/AppError";
import { FarmerModel } from "../models/farmer.model";
import { DUMMY_HASH, comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";

const INVALID_CREDENTIALS = () => new AppError("Invalid phone number or PIN", 401);

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
