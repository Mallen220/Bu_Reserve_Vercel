import type { Booking } from "@/types/database";

type LocalBookingInput = Pick<Booking, "email" | "room_id" | "start_time" | "end_time">;

declare global {
  var __LOCAL_TEST_BOOKINGS__: Booking[] | undefined;
}

function getStore(): Booking[] {
  if (!globalThis.__LOCAL_TEST_BOOKINGS__) {
    globalThis.__LOCAL_TEST_BOOKINGS__ = [];
  }
  return globalThis.__LOCAL_TEST_BOOKINGS__;
}

function cleanupExpired(): void {
  const now = Date.now();
  const store = getStore();
  globalThis.__LOCAL_TEST_BOOKINGS__ = store.filter((booking) => new Date(booking.end_time).getTime() > now);
}

export function listLocalTestBookings(): Booking[] {
  cleanupExpired();
  return [...getStore()].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
}

export function listLocalTestBookingsForEmail(email: string): Booking[] {
  const normalized = email.trim().toLowerCase();
  return listLocalTestBookings().filter((booking) => booking.email.toLowerCase() === normalized);
}

export function createLocalTestBooking(input: LocalBookingInput): Booking {
  cleanupExpired();
  const booking: Booking = {
    id: crypto.randomUUID(),
    email: input.email,
    room_id: input.room_id,
    start_time: input.start_time,
    end_time: input.end_time,
    created_at: new Date().toISOString(),
  };
  getStore().push(booking);
  return booking;
}

export function cancelLocalTestBooking(bookingId: string, email: string): boolean {
  cleanupExpired();
  const normalized = email.trim().toLowerCase();
  const store = getStore();
  const index = store.findIndex((booking) => booking.id === bookingId && booking.email.toLowerCase() === normalized);
  if (index < 0) {
    return false;
  }
  store.splice(index, 1);
  return true;
}
