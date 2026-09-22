import { SignJWT, jwtVerify } from "jose";
import { ServiceId } from "@/lib/constants";

const encoder = new TextEncoder();

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return encoder.encode(secret);
}

export type OAuthState = {
  userId: string;
  service: ServiceId;
  /** MAL only: PKCE code_verifier, generated at authorize time. */
  codeVerifier?: string;
};

/** Signed, short-lived token carried as the OAuth `state` param — avoids
 * needing a server-side pending-authorization table. */
export async function createOAuthState(state: OAuthState): Promise<string> {
  return new SignJWT(state)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey());
}

export async function verifyOAuthState(token: string): Promise<OAuthState> {
  const { payload } = await jwtVerify(token, secretKey());
  return payload as unknown as OAuthState;
}

export function randomCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(96);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
