// GitHub signs each webhook delivery with the secret set on the webhook: the
// `X-Hub-Signature-256` header is `sha256=` and the hex HMAC-SHA256 of the raw
// request body, keyed with the secret. The body must be checked exactly as it
// arrived, before it is parsed.
import { createHmac, timingSafeEqual } from "node:crypto";

/** The `X-Hub-Signature-256` value GitHub sends for `body` under `secret`. */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/** Whether `header` is the signature of `body` under `secret`, compared in constant time. */
export function validSignature(secret: string, body: string, header: string | undefined): boolean {
  if (header === undefined) return false;
  const expected = Buffer.from(signBody(secret, body), "utf8");
  const given = Buffer.from(header, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
