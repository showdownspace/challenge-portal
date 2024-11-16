import * as jose from "jose";

const secret = new TextEncoder().encode(Bun.env["JWT_SECRET"] || "JWT Secret");

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
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return { active: payload };
  } catch (error: any) {
    return { reason: "Invalid session cookie", error };
  }
}

export async function generateSessionToken(payload: jose.JWTPayload) {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("12h")
    .sign(secret);
}
