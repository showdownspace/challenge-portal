import * as jose from "jose";
import { JwtUtils } from "./jwtUtils";

const jwtUtils = new JwtUtils("session-management");

type ResolveSessionResult =
  | { active: jose.JWTPayload }
  | { active?: undefined; reason: string; error?: Error };

export async function resolveSession(
  token: string | undefined
): Promise<ResolveSessionResult> {
  if (!token) {
    return { reason: "No session cookie" };
  }
  try {
    const payload = await jwtUtils.verify(token);
    return { active: payload };
  } catch (error: any) {
    return { reason: "Invalid session cookie", error };
  }
}

export async function generateSessionToken(payload: jose.JWTPayload) {
  return jwtUtils.sign(payload);
}
