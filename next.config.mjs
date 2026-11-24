
const config = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  outputFileTracingIncludes: {
    "/admin/distribute": ["./node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff"],
    "/admin/export/*": ["./node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default config;
