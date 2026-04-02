"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { getSession } from "@/lib/session";
import { cleanupExpiredBookings } from "@/lib/booking-cleanup";
import { getLocalTestBookingSeeds, getLocalTestRooms, isLocalTestModeEnabled } from "@/lib/local-test-mode";
import {
  cancelLocalTestBooking,
  createLocalTestBooking,
  listLocalTestBookings,
  listLocalTestBookingsForEmail,
} from "@/lib/local-test-bookings";
import { revalidatePath } from "next/cache";

const MAX_DAYS_AHEAD = 7;
const SLOT_DURATIONS = [1, 2] as const;

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function parseDateKey(dateStr: string): [number, number, number] | null {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return [year, month, day];
}

function formatDateKeyFromUtc(date: Date, tzOffsetMinutes: number): string {
  const localMs = date.getTime() - tzOffsetMinutes * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

function addDaysToDateKey(dateStr: string, days: number): string | null {
  const parts = parseDateKey(dateStr);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function normalizeTzOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 0;
  if (parsed < -840 || parsed > 840) return 0;
  return parsed;
}

function parseDateAndTimeAsUtc(dateStr: string, startStr: string, tzOffsetMinutes: number): Date | null {
  const dateParts = parseDateKey(dateStr);
  if (!dateParts) {
    return null;
  }
  const [year, month, day] = dateParts;
  const [hours, minutes] = startStr.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0) + tzOffsetMinutes * 60 * 1000;
  return new Date(utcMs);
}

function getLocalSeedBookedRoomIds(startTime: Date, endTime: Date, tzOffsetMinutes: number): Set<string> {
  const rooms = getLocalTestRooms();
  const roomIdByName = new Map(rooms.map((room) => [room.name, room.id]));
  const todayKey = formatDateKeyFromUtc(new Date(), tzOffsetMinutes);
  const roomIds = new Set<string>();

  for (const seed of getLocalTestBookingSeeds()) {
    const seedDate = addDaysToDateKey(todayKey, seed.dateOffsetDays);
    if (!seedDate) continue;
    const seedStart = parseDateAndTimeAsUtc(seedDate, seed.start, tzOffsetMinutes);
    if (!seedStart) continue;
    const seedEnd = new Date(seedStart.getTime() + seed.duration * 60 * 60 * 1000);
    if (seedStart < endTime && seedEnd > startTime) {
      const roomId = roomIdByName.get(seed.roomName);
      if (roomId) roomIds.add(roomId);
    }
  }

  return roomIds;
}

export async function createBooking(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const roomId = formData.get("room_id") as string;
  const dateStr = formData.get("date") as string;
  const startStr = formData.get("start") as string;
  const duration = Number(formData.get("duration")) as 1 | 2;
  const tzOffsetMinutes = normalizeTzOffset(formData.get("tz_offset"));
  if (!roomId || !dateStr || !startStr || !SLOT_DURATIONS.includes(duration)) {
    return { error: "Missing or invalid fields." };
  }

  // Parse date in user's local timezone and convert to UTC for storage
  const startTime = parseDateAndTimeAsUtc(dateStr, startStr, tzOffsetMinutes);
  if (!startTime) {
    return { error: "Invalid date or time." };
  }
  const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

  const todayKey = formatDateKeyFromUtc(new Date(), tzOffsetMinutes);
  const maxDateKey = addDaysToDateKey(todayKey, MAX_DAYS_AHEAD);
  if (!maxDateKey) {
    return { error: "Invalid date or time." };
  }

  if (dateStr < todayKey) {
    return { error: "Cannot book in the past." };
  }
  if (dateStr > maxDateKey) {
    return { error: `Bookings are only allowed up to ${MAX_DAYS_AHEAD} days in advance.` };
  }

  const now = new Date();
  if (endTime <= now) {
    return { error: "Booking must end in the future." };
  }

  if (isLocalTestModeEnabled()) {
    const rooms = getLocalTestRooms();
    const room = rooms.find((next) => next.id === roomId);
    if (!room) {
      return { error: "Room not found." };
    }

    const myBookings = listLocalTestBookingsForEmail(session.email);
    if (myBookings.length > 0) {
      return { error: "You can only have one booking at a time." };
    }

    const hasSeedConflict = getLocalSeedBookedRoomIds(startTime, endTime, tzOffsetMinutes).has(roomId);
    const hasLocalConflict = listLocalTestBookings().some((booking) => {
      if (booking.room_id !== roomId) return false;
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return bookingStart < endTime && bookingEnd > startTime;
    });

    if (hasSeedConflict || hasLocalConflict) {
      return { error: "This room is already booked for the selected time." };
    }

    createLocalTestBooking({
      email: session.email,
      room_id: roomId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });
    revalidatePath("/dashboard");
    return { success: true };
  }

  await cleanupExpiredBookings();

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

  if (isLocalTestModeEnabled()) {
    const cancelled = cancelLocalTestBooking(bookingId, session.email);
    if (!cancelled) return { error: "Booking not found." };
    revalidatePath("/dashboard");
    return { success: true };
  }

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
  const tzOffsetMinutes = normalizeTzOffset(tzOffsetMinutesRaw);
  const startTime = parseDateAndTimeAsUtc(dateStr, startStr, tzOffsetMinutes);
  if (!startTime) return { rooms: [] };
  const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

  if (isLocalTestModeEnabled()) {
    const rooms = getLocalTestRooms();
    const overlappingRoomIds = getLocalSeedBookedRoomIds(startTime, endTime, tzOffsetMinutes);
    for (const booking of listLocalTestBookings()) {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      if (bookingStart < endTime && bookingEnd > startTime) {
        overlappingRoomIds.add(booking.room_id);
      }
    }

    return { rooms: rooms.filter((room) => !overlappingRoomIds.has(room.id)) };
  }

  await cleanupExpiredBookings();
  const supabase = createAdminClient();

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

export async function getAvailableSlots(roomId: string, dateStr: string, tzOffsetMinutesRaw?: number) {
  const tzOffsetMinutes = normalizeTzOffset(tzOffsetMinutesRaw);

  if (isLocalTestModeEnabled()) {
    const rooms = getLocalTestRooms();
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const room = roomById.get(roomId);
    if (!room) return { slots: [] as { start: string; end: string }[] };

    const todayKey = formatDateKeyFromUtc(new Date(), tzOffsetMinutes);
    const bookedRanges = getLocalTestBookingSeeds()
      .filter((seed) => seed.roomName === room.name)
      .map((seed) => {
        const seedDate = addDaysToDateKey(todayKey, seed.dateOffsetDays);
        if (!seedDate) return null;
        const seedStart = parseDateAndTimeAsUtc(seedDate, seed.start, tzOffsetMinutes);
        if (!seedStart) return null;
        const seedEnd = new Date(seedStart.getTime() + seed.duration * 60 * 60 * 1000);
        return { start: seedStart.getTime(), end: seedEnd.getTime() };
      })
      .filter((range): range is { start: number; end: number } => Boolean(range));

    for (const booking of listLocalTestBookings()) {
      if (booking.room_id !== roomId) continue;
      bookedRanges.push({
        start: new Date(booking.start_time).getTime(),
        end: new Date(booking.end_time).getTime(),
      });
    }

    const slots: { start: string; end: string }[] = [];
    for (let hour = 0; hour <= 23; hour++) {
      for (const duration of SLOT_DURATIONS) {
        if (duration === 2 && hour === 23) continue;
        const start = parseDateAndTimeAsUtc(dateStr, `${hour.toString().padStart(2, "0")}:00`, tzOffsetMinutes);
        if (!start) continue;
        const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
        const startTs = start.getTime();
        const endTs = end.getTime();
        if (endTs <= Date.now()) continue;
        const overlaps = bookedRanges.some((range) => startTs < range.end && endTs > range.start);
        if (!overlaps) {
          slots.push({
            start: `${hour.toString().padStart(2, "0")}:00`,
            end: `${((hour + duration) % 24).toString().padStart(2, "0")}:00`,
          });
        }
      }
    }
    return { slots };
  }

  await cleanupExpiredBookings();
  const supabase = createAdminClient();
  const dayStart = parseDateAndTimeAsUtc(dateStr, "00:00", tzOffsetMinutes);
  if (!dayStart) return { slots: [] as { start: string; end: string }[] };

  const todayKey = formatDateKeyFromUtc(new Date(), tzOffsetMinutes);
  const maxDateKey = addDaysToDateKey(todayKey, MAX_DAYS_AHEAD);
  if (!maxDateKey || dateStr < todayKey || dateStr > maxDateKey) {
    return { slots: [] as { start: string; end: string }[] };
  }

  const dayEnd = addDays(dayStart, 1);

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
      const start = parseDateAndTimeAsUtc(dateStr, `${hour.toString().padStart(2, "0")}:00`, tzOffsetMinutes);
      if (!start) continue;
      const end = new Date(start.getTime() + duration * 60 * 60 * 1000);
      const startTs = start.getTime();
      const endTs = end.getTime();
      const now = Date.now();
      if (endTs <= now) continue;
      const overlaps = bookedRanges.some((r) => startTs < r.end && endTs > r.start);
      if (!overlaps) {
        slots.push({
          start: `${hour.toString().padStart(2, "0")}:00`,
          end: `${((hour + duration) % 24).toString().padStart(2, "0")}:00`,
        });
      }
    }
  }
  return { slots };
}
