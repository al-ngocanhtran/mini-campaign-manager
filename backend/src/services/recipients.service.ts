import { UniqueConstraintError } from "sequelize";
import { Recipient } from "../models/index.js";
import { ConflictError } from "../errors/http.js";

export async function listRecipients(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const { rows, count } = await Recipient.findAndCountAll({
    order: [["email", "ASC"]],
    limit,
    offset,
  });
  return { recipients: rows, total: count, page, limit };
}

export async function createRecipient(input: { email: string; name?: string }) {
  const normalizedEmail = input.email.toLowerCase();
  try {
    return await Recipient.create({
      email: normalizedEmail,
      name: input.name ?? normalizedEmail.split("@")[0],
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw new ConflictError("Recipient with this email already exists");
    }
    throw err;
  }
}
