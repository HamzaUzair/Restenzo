import { createHmac, timingSafeEqual } from "crypto";

type ResumeTokenPayload = {
  uid: number;
  email: string;
  exp: number;
};

const RESUME_TOKEN_TTL_SECONDS = 15 * 60;
const FALLBACK_SECRET = "restenzo-resume-secret";

function getResumeSecret() {
  return (
    process.env.AUTH_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.STRIPE_SECRET_KEY ||
    FALLBACK_SECRET
  );
}

function b64urlEncode(raw: string) {
  return Buffer.from(raw, "utf8").toString("base64url");
}

function b64urlDecode(raw: string) {
  return Buffer.from(raw, "base64url").toString("utf8");
}

function sign(data: string) {
  return createHmac("sha256", getResumeSecret()).update(data).digest("base64url");
}

export function issueOnboardingResumeToken(userId: number, email: string) {
  const payload: ResumeTokenPayload = {
    uid: userId,
    email,
    exp: Math.floor(Date.now() / 1000) + RESUME_TOKEN_TTL_SECONDS,
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyOnboardingResumeToken(token: string): ResumeTokenPayload | null {
  const [encoded, providedSig] = token.split(".");
  if (!encoded || !providedSig) return null;

  const expectedSig = sign(encoded);
  const provided = Buffer.from(providedSig, "utf8");
  const expected = Buffer.from(expectedSig, "utf8");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(b64urlDecode(encoded)) as ResumeTokenPayload;
    if (!parsed?.uid || !parsed?.email || !parsed?.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
