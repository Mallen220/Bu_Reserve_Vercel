import type { Room } from "@/types/database";

export function isLocalTestModeEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_AUTH_BYPASS === "true") return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getLocalTestEmail(inputEmail: string): string {
  const fallback = process.env.DEV_AUTH_BYPASS_EMAIL || inputEmail || "dev@local.test";
  return fallback.trim().toLowerCase();
}

export function getLocalTestRooms(): Room[] {
  const createdAt = new Date().toISOString();
  return [
    { id: "local-910", name: "910", capacity: 10, created_at: createdAt },
    { id: "local-911", name: "911", capacity: 4, created_at: createdAt },
    { id: "local-912", name: "912", capacity: 10, created_at: createdAt },
  ];
}