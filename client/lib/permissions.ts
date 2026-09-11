/**
 * ============================================================================
 * PERMISSIONS (UI CONVENIENCE ONLY)
 * ============================================================================
 * This file decides what the UI *shows or hides* for a role — nothing more.
 * It is NOT a security boundary. Every backend endpoint must independently
 * check the user's real permissions and case assignment before returning
 * data or performing an action, because a user can always edit browser
 * JavaScript. See spec section 17, "Security-Critical Frontend Rules".
 * ============================================================================
 */

import type { Permission, Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  /** Roles allowed to see this item. Omit to allow all authenticated roles. */
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Cases", href: "/dashboard/cases" },
  { label: "Documents", href: "/dashboard/documents" },
  { label: "Upload", href: "/dashboard/documents/upload", roles: ["investigation_officer", "forensic_officer", "administrator"] },
  { label: "Chain of Custody", href: "/dashboard/custody" },
  { label: "Integrity", href: "/dashboard/integrity" },
  { label: "Audit Ledger", href: "/dashboard/audit" },
  { label: "Security Alerts", href: "/dashboard/alerts" },
  { label: "Emergency Access", href: "/dashboard/emergency-access" },
  { label: "Administration", href: "/dashboard/admin", roles: ["administrator"] },
  { label: "Settings", href: "/dashboard/settings" },
];

export function visibleNavItems(role: Role | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

export function hasPermission(userPermissions: Permission[] | undefined, permission: Permission): boolean {
  return !!userPermissions?.includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  investigation_officer: "Investigation Officer",
  forensic_officer: "Forensic Officer",
  prosecutor: "Prosecutor / Lawyer",
  court_staff: "Court Staff",
  administrator: "Administrator",
  auditor: "Auditor",
};
