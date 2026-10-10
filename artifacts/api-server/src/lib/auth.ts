import jwt from "jsonwebtoken";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || "collab_ide_default_secure_session_secret_key_2026";
  return secret;
}

export interface JwtPayload {
  userId: number;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
