"use client";

import { ReactNode } from "react";

/**
 * Shared full-bleed background treatment for the Landing, Login and MFA
 * pages only — dashboard pages never use this. Overlay is deliberately
 * light so the courthouse photo stays visible; readability comes from the
 * white card in front of it, not from darkening the whole page.
 */
export default function AuthBackground({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <main
      className={`relative flex min-h-screen w-full ${
        align === "center" ? "items-center justify-center" : "items-center"
      } overflow-hidden px-4 py-12`}
      style={{
        backgroundImage: "url('/images/justice-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950/55 via-navy-950/30 to-navy-950/15" />
      <div className="relative z-10 w-full">{children}</div>
    </main>
  );
}
