import Link from "next/link";

const tabs = [{ href: "/admin", name: "Ballot" }, { href: "/admin/voters", name: "Pengundi" }];

export function AdminNav({ current }: { current: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]">
      <nav className="flex gap-1" aria-label="Pentadbiran pilihan raya">
        {tabs.map(({ href, name }) => (
          <Link key={href} href={href} aria-current={href === current ? "page" : undefined}
            className="admin-tab">{name}</Link>
        ))}
      </nav>
      <form method="post" action="/admin/logout" className="pb-1">
        <button className="ghost" type="submit">Keluar</button>
      </form>
    </div>
  );
}
