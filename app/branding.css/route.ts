import { brandingStyle } from "../../lib/branding";

export function GET(request: Request) {
  const style = brandingStyle(new URL(request.url).searchParams.get("color"));
  return new Response(style, {
    status: style ? 200 : 404,
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
