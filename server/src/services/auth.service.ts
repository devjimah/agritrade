import { AppError } from "../errors/AppError";
import { UserDocument, UserModel } from "../models/user.model";
import { DUMMY_HASH, comparePassword } from "../utils/password";
import { signToken } from "../utils/jwt";

const INVALID_CREDENTIALS = () => new AppError("Invalid email or password", 401);

export async function login(
  email: string,
  password: string
): Promise<{ user: UserDocument; token: string }> {
  const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
  if (!user) {
    await comparePassword(password, DUMMY_HASH);
    throw INVALID_CREDENTIALS();
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw INVALID_CREDENTIALS();

  const token = signToken({ sub: user._id.toString(), role: user.role });
  return { user, token };
}
