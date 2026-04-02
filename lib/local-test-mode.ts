import type { Room } from "@/types/database";

export type LocalTestBookingSeed = {
  roomName: "910" | "911" | "912";
  dateOffsetDays: number;
  start: `${number}${number}:00`;
  duration: 1 | 2;
};

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

export function getLocalTestBookingSeeds(): LocalTestBookingSeed[] {
  return [
    { roomName: "910", dateOffsetDays: 0, start: "10:00", duration: 2 },
    { roomName: "911", dateOffsetDays: 0, start: "11:00", duration: 1 },
    { roomName: "912", dateOffsetDays: 0, start: "14:00", duration: 2 },
    { roomName: "910", dateOffsetDays: 1, start: "09:00", duration: 1 },
    { roomName: "911", dateOffsetDays: 1, start: "13:00", duration: 2 },
  ];
}