import { isIP } from "node:net";
import { z } from "zod";

export function sessionSecret() {
  return z.string().min(32).parse(process.env.SESSION_SECRET);
}

export function appOrigin() {
  const onVercel = process.env.VERCEL === "1";
  const deployment = process.env.VERCEL_URL;
  const value = process.env.APP_ORIGIN || (onVercel && deployment ? `https://${deployment}` : undefined);
  return new URL(z.url().parse(value));
}

export function acceptsOrigin(request: Request) {
  const canonical = appOrigin();
  return canonical.protocol === "https:" && request.headers.get("origin") === canonical.origin;
}

// Use the IP header overwritten by the deployment platform.
export function requestIp(request: Request) {
  const client = request.headers.get(process.env.VERCEL === "1" ? "x-vercel-forwarded-for" : "x-kopetro-client-ip") ?? "";
  return isIP(client) ? client : "unknown";
}

export function redirectAfterPost(path: string) {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}
