import * as jose from "jose";

export class JwtUtils {
  private secret: Uint8Array;
  private issuer: string;
  private audience: string;

  constructor(audience: string) {
    this.secret = new TextEncoder().encode(
      Bun.env["JWT_SECRET"] || "JWT Secret"
    );
    this.issuer =
      "https://showdown.space/events/browser-automation-challenges/";
    this.audience = audience;
  }

  async sign(payload: jose.JWTPayload) {
    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("12h")
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .sign(this.secret);
  }

  async verify(token: string): Promise<jose.JWTPayload> {
    const { payload } = await jose.jwtVerify(token, this.secret, {
      algorithms: ["HS256"],
      issuer: this.issuer,
      audience: this.audience,
    });
    return payload;
  }
}
