"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavigationIcon({ href }: { href: string }) {
  const paths: Record<string, React.ReactNode> = {
    "/app": <path d="M4 9.2 10 4l6 5.2V16H5V9.2Z" />,
    "/applications": <><rect x="4" y="5" width="12" height="11" rx="2" /><path d="M7 5V3.5h6V5M7.5 9h5M7.5 12h3" /></>,
    "/profile": <><circle cx="10" cy="6.5" r="3" /><path d="M4.5 16c.4-3.1 2.2-4.7 5.5-4.7s5.1 1.6 5.5 4.7" /></>,
    "/interview": <><path d="M4 4.5h12v8H9l-3.5 3v-3H4v-8Z" /><path d="M7.5 8.5h5" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[href]}
    </svg>
  );
}

type NavLinkProps = {
  href: string;
  label: string;
  compact?: boolean;
};

export function NavLink({ href, label, compact = false }: NavLinkProps) {
  const pathname = usePathname();
  const selected =
    href === "/app"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`flex shrink-0 items-center gap-3 border-2 border-transparent font-extrabold transition-[background-color,box-shadow,transform] ${
        compact ? "rounded-xl px-3 py-2.5 text-sm" : "rounded-xl px-3.5 py-3 text-sm"
      } ${
        selected
          ? "border-[var(--ink)] bg-white shadow-[3px_3px_0_var(--ink)]"
          : "hover:border-[color:var(--ink-soft)] hover:bg-white/45"
      }`}
    >
      <NavigationIcon href={href} />
      <span>{label}</span>
    </Link>
  );
}
