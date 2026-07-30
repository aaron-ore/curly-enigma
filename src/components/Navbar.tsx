"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/import", label: "Import" },
  { href: "/billing-run", label: "Billing Run" },
  { href: "/charges", label: "Charges" },
  { href: "/export", label: "Export" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Nav Links - Left */}
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-white/60 text-[#0066FF] shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Logo - Right */}
          <div className="flex items-center">
            <Image
              src="/codepay-logo.png"
              alt="CodePay"
              width={140}
              height={25}
              className="h-6 w-auto"
              priority
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
