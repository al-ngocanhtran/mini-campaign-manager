import bcrypt from "bcrypt";
import { User } from "../models/index.js";
import { signToken } from "../middleware/auth.js";
import { ConflictError, UnauthorizedError } from "../errors/http.js";

const BCRYPT_ROUNDS = 12;

type RegisterInput = { email: string; name: string; password: string };
type LoginInput = { email: string; password: string };

export async function register(input: RegisterInput) {
  const existing = await User.findOne({ where: { email: input.email }, attributes: ["id"] });
  if (existing) throw new ConflictError("Email already registered");

  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await User.create({ email: input.email, name: input.name, password_hash });
  const token = signToken({ id: user.id, email: user.email });

  return {
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
    token,
  };
}

export async function login(input: LoginInput) {
  // Generic message for unknown email AND wrong password — prevents user enumeration.
  const user = await User.findOne({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  const token = signToken({ id: user.id, email: user.email });

  return {
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
    token,
  };
}
