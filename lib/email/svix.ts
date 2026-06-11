import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Verify a Resend (Svix-signed) webhook. Resend signs the raw body with the
// endpoint's signing secret (whsec_…). We reject anything unsigned or stale.
// Implemented with Node crypto so we don't add the `svix` dependency.
export function verifyResendWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string | undefined,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  // Reject replays / clock-skew beyond 5 minutes.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header is a space-separated list of "v1,<base64sig>" entries.
  return signature.split(" ").some((part) => {
    const comma = part.indexOf(",");
    if (comma === -1) return false;
    const version = part.slice(0, comma);
    const sig = part.slice(comma + 1);
    if (version !== "v1" || !sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}
