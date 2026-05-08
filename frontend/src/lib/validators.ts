// Mirrors backend/src/validation/schemas.ts. Keep messages in sync — users see
// the same text whether the rule fires client-side or server-side.

export const COMMON_PASSWORDS = new Set([
  "password1234",
  "passw0rd1234",
  "password12345",
  "qwerty123456",
  "qwertyuiop12",
  "123456789012",
  "1234567890ab",
  "abcdefghijkl",
  "letmein12345",
  "iloveyou1234",
  "welcome12345",
  "admin1234567",
  "administrator",
  "monkey123456",
  "dragon123456",
  "football1234",
  "baseball1234",
  "sunshine1234",
  "princess1234",
  "trustno1abcd",
  "starwars1234",
  "whatever1234",
  "changeme1234",
  "passwordpassword",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return "Please enter a valid email address";
  if (v.length > 254) return "Email is too long";
  if (!EMAIL_RE.test(v)) return "Please enter a valid email address";
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 12) return "Password must be at least 12 characters";
  if (value.length > 128) return "Password must be at most 128 characters";
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return "This password is too common, choose a stronger one";
  }
  return null;
}

export function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Name is required";
  if (v.length > 255) return "Name is too long";
  return null;
}
