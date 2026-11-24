import type { Metadata } from "next";
import Image from "next/image";
import { connection } from "next/server";
import "@fontsource/public-sans/latin-400.css";
import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-700.css";
import "./globals.css";

export const metadata: Metadata = { title: "Pemilihan AGM 2026 | Koperasi Kopetro" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="ms">
      <body>
        <div className="mx-auto max-w-[920px] p-3 sm:p-4">
          <header className="mb-4 flex items-center gap-3.5 border-b-[3px] border-[var(--hi)] pt-2 pb-4">
            <Image src="/kopetro.png" width={104} height={61} alt="Logo Kopetro" unoptimized
              className="h-12 w-auto shrink-0 rounded-lg bg-white px-2 py-1" />
            <div>
              <h1 className="text-[1.4rem] leading-tight font-bold">Koperasi Kopetro</h1>
              <p className="mut">Pemilihan AGM 2026</p>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
