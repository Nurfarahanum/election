import Link from "next/link";

const tabs = [
  { href: "/admin", name: "Ballot" }, { href: "/admin/voters", name: "Pengundi" },
  { href: "/admin/launch", name: "Pelancaran" }, { href: "/admin/results", name: "Keputusan" },
  { href: "/admin/audit", name: "Log audit" },
  { href: "/admin/branding", name: "Penjenamaan" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]">
      <nav className="flex flex-wrap gap-1" aria-label="Pentadbiran pilihan raya">
        {tabs.map(({ href, name }) => (
          <Link key={href} href={href} aria-current={href === current ? "page" : undefined}
            className="admin-tab">{name}</Link>
        ))}
      </nav>
      <div className="flex flex-wrap gap-2 pb-1">
        <Link href="/admin/account" className="ghost inline-flex items-center" aria-current={current === "/admin/account" ? "page" : undefined}>Tukar kata laluan</Link>
        <form method="post" action="/admin/logout">
        <button className="ghost" type="submit">Keluar</button>
        </form>
      </div>
    </div>
  );
}
