import { createRemoteJWKSet, jwtVerify } from "jose";

const googleIssuers = ["https://accounts.google.com", "accounts.google.com"];
const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

export async function verifyGoogleIdentityToken(
  identityToken: string,
  audience: string
) {
  const { payload } = await jwtVerify(identityToken, googleJwks, {
    issuer: googleIssuers,
    audience,
  });

  if (!payload.sub)
    throw Error("Google identity token is missing the subject.");

  return payload as {
    sub: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
}
