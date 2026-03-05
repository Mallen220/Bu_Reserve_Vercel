"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { getSession } from "@/lib/session";
import { cleanupExpiredBookings } from "@/lib/booking-cleanup";
import { revalidatePath } from "next/cache";

const MAX_DAYS_AHEAD = 7;
const SLOT_DURATIONS = [1, 2] as const;

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function normalizeTzOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < -840 || parsed > 840) return 0;
  return parsed;
}

function parseDateAndTimeAsUtc(dateStr: string, startStr: string, tzOffsetMinutes: number): Date | null {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = startStr.split(":").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0) + tzOffsetMinutes * 60 * 1000;
  return new Date(utcMs);
}

export async function createBooking(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  await cleanupExpiredBookings();

  const roomId = formData.get("room_id") as string;
  const dateStr = formData.get("date") as string;
  const startStr = formData.get("start") as string;
  const duration = Number(formData.get("duration")) as 1 | 2;
  const tzOffsetMinutes = normalizeTzOffset(formData.get("tz_offset"));
  if (!roomId || !dateStr || !startStr || !SLOT_DURATIONS.includes(duration)) {
    return { error: "Missing or invalid fields." };
  }

  // Parse date in user's local timezone and convert to UTC for storage
  const [year, month, day] = dateStr.split('-').map(Number);
  const startTime = parseDateAndTimeAsUtc(dateStr, startStr, tzOffsetMinutes);
  if (!startTime) {
    return { error: "Invalid date or time." };
  }
  const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateOnly = new Date(year, month - 1, day, 0, 0, 0, 0);
  const maxDate = addDays(today, MAX_DAYS_AHEAD);

  if (dateOnly < today) {
    return { error: "Cannot book in the past." };
  }
  if (dateOnly > maxDate) {
    return { error: `Bookings are only allowed up to ${MAX_DAYS_AHEAD} days in advance.` };
  }

  const now = new Date();
  if (endTime <= now) {
    return { error: "Booking must end in the future." };
  }

  const supabase = createAdminClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).single();
  if (!room) {
    return { error: "Room not found." };
  }

  const { error } = await supabase.from("bookings").insert({
    email: session.email,
    room_id: roomId,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/dashboard");
  return { success: true };
}

export async function cancelBooking(bookingId: string) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  await cleanupExpiredBookings();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId)
    .eq("email", session.email);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getAvailableRooms(dateStr: string, startStr: string, duration: number, tzOffsetMinutesRaw?: number) {
  await cleanupExpiredBookings();
  const supabase = createAdminClient();
  
  const tzOffsetMinutes = normalizeTzOffset(tzOffsetMinutesRaw);
  const startTime = parseDateAndTimeAsUtc(dateStr, startStr, tzOffsetMinutes);
  if (!startTime) return { rooms: [] };
  const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);
  const startTs = startTime.toISOString();
  const endTs = endTime.toISOString();

  const { data: allRooms } = await supabase.from("rooms").select("*").order("name");
  if (!allRooms?.length) return { rooms: [] };

  const { data: overlapping } = await supabase
    .from("bookings")
    .select("room_id")
    .lt("start_time", endTs)
    .gt("end_time", startTs);

  const bookedRoomIds = new Set((overlapping ?? []).map((b) => b.room_id));
  const rooms = allRooms.filter((r) => !bookedRoomIds.has(r.id));
  return { rooms };
}

export async function getAvailableSlots(roomId: string, dateStr: string) {
  await cleanupExpiredBookings();
  const supabase = createAdminClient();
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, MAX_DAYS_AHEAD);
  if (date < today || date > maxDate) return { slots: [] as { start: string; end: string }[] };

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const { data: existing } = await supabase
    .from("bookings")
    .select("start_time, end_time")
    .eq("room_id", roomId)
    .lt("start_time", dayEnd.toISOString())
    .gt("end_time", dayStart.toISOString());

  const bookedRanges = (existing ?? []).map((b) => ({
    start: new Date(b.start_time).getTime(),
    end: new Date(b.end_time).getTime(),
  }));

  const slots: { start: string; end: string }[] = [];
  for (let hour = 0; hour <= 23; hour++) {
    for (const duration of SLOT_DURATIONS) {
      if (duration === 2 && hour === 23) continue;
      const start = new Date(date);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(end.getHours() + duration, 0, 0);
      const startTs = start.getTime();
      const endTs = end.getTime();
      const now = Date.now();
      if (endTs <= now) continue;
      const overlaps = bookedRanges.some((r) => startTs < r.end && endTs > r.start);
      if (!overlaps) {
        slots.push({
          start: start.toTimeString().slice(0, 5),
          end: end.toTimeString().slice(0, 5),
        });
      }
    }
  }
  return { slots };
}
