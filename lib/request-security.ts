import { isIP } from "node:net";
import { z } from "zod";

export function sessionSecret() {
  return z.string().min(32).parse(process.env.SESSION_SECRET);
}

export function acceptsOrigin(request: Request) {
  const canonical = new URL(z.url().parse(process.env.APP_ORIGIN));
  return canonical.protocol === "https:" && request.headers.get("origin") === canonical.origin;
}

// Caddy overwrites this header and the app port stays on the private network.
export function requestIp(request: Request) {
  const client = request.headers.get("x-kopetro-client-ip") ?? "";
  return isIP(client) ? client : "unknown";
}

export function redirectAfterPost(path: string) {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}
