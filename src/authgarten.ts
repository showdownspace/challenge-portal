import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthgartenOptions {
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
}

export function generateAuthgartenAuthorizeURL(
  options: AuthgartenOptions
): string {
  const baseURL = "https://creatorsgarten.org/auth/authorize";
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "id_token",
    scope: "openid profile",
    state: options.state || "",
  });
  return `${baseURL}?${params.toString()}`;
}

const issuer = "https://creatorsgarten.org";
const keySetUrl = new URL("https://creatorsgarten.org/.well-known/jwks");
const keySet = createRemoteJWKSet(keySetUrl);

export function validateAuthgartenToken(jwt: string, clientId: string) {
  return jwtVerify(jwt, keySet, { issuer, audience: clientId });
}
