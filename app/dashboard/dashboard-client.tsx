"use client";

import Image from "next/image";
import type { Booking, Room } from "@/types/database";
import { cancelBooking, createBooking, getAvailableRooms } from "@/app/dashboard/actions";
import { logout } from "@/app/logout/actions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MAX_DAYS = 7;

function formatLocalDate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateOptions() {
  const options: { value: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i <= MAX_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    options.push({
      value: formatLocalDate(d),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return options;
}

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i;
  const label = hour === 0 ? "12:00 am" : hour < 12 ? `${hour}:00 am` : hour === 12 ? "12:00 pm" : `${hour - 12}:00 pm`;
  return { value: `${hour.toString().padStart(2, "0")}:00`, label };
});

function formatDateHeading(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function getRoomFeatures(roomName: string) {
  if (roomName === "910") return ["Whiteboard", "Power outlets", "Wi-Fi"];
  if (roomName === "911") return ["Monitor", "Power outlets", "Wi-Fi"];
  if (roomName === "912") return ["Whiteboard", "Monitor", "Power outlets", "Wi-Fi", "Projector"];
  return ["Power outlets", "Wi-Fi"];
}

function needsGroupConfirmation(room: Room): boolean {
  return room.name === "910" || room.name === "912";
}

type Props = {
  rooms: Room[];
  myBooking: (Booking & { room?: Room }) | null;
  userEmail: string;
};

export function DashboardClient({ rooms, myBooking, userEmail }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(() => formatLocalDate(new Date()));
  const [start, setStart] = useState("09:00");
  const [duration, setDuration] = useState<1 | 2>(1);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [bookingRoomId, setBookingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const tzOffset = new Date().getTimezoneOffset();

  const dateOptions = getDateOptions();

  useEffect(() => {
    let cancelled = false;
    getAvailableRooms(date, start, duration, tzOffset).then(({ rooms: next }) => {
      if (!cancelled) {
        setAvailableRooms(next);
        setRoomsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [date, start, duration, tzOffset]);

  function handleDateChange(next: string) {
    setDate(next);
    setRoomsLoading(true);
    setError(null);
  }

  function handleStartChange(next: string) {
    setStart(next);
    setRoomsLoading(true);
    setError(null);
  }

  function handleDurationChange(next: 1 | 2) {
    setDuration(next);
    setRoomsLoading(true);
    setError(null);
  }

  function getEndTimeLabel(startValue: string, hours: number) {
    const index = TIME_OPTIONS.findIndex((opt) => opt.value === startValue);
    if (index < 0) return "12:00 am";
    const endIndex = (index + hours) % TIME_OPTIONS.length;
    return TIME_OPTIONS[endIndex]?.label ?? "12:00 am";
  }

  async function handleBookRoom(room: Room) {
    const needsConfirmation = needsGroupConfirmation(room);
    const hasConfirmedGroupBooking =
      !needsConfirmation ||
      window.confirm("Room 910/912 is for group study use. Do you confirm this booking is for a group?");
    if (!hasConfirmedGroupBooking) return;

    const roomId = room.id;
    setBookingRoomId(roomId);
    setError(null);
    const formData = new FormData();
    formData.set("room_id", roomId);
    formData.set("date", date);
    formData.set("start", start);
    formData.set("duration", String(duration));
    formData.set("tz_offset", String(tzOffset));
    formData.set("booking_confirmed", hasConfirmedGroupBooking ? "yes" : "no");
    const result = await createBooking(formData);
    setBookingRoomId(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    if (!myBooking) return;
    setCancelLoading(true);
    const result = await cancelBooking(myBooking.id);
    setCancelLoading(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1d1d1f]">
      <header className="border-b border-[#d8d8d8] bg-[#f8f8f8]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Image
              src="/bu_logo.jpg"
              alt="BU Reserve"
              width={180}
              height={56}
              className="h-12 w-auto rounded-lg border border-[#dedee1] bg-white p-1"
              priority
            />
            <div>
              <h1 className="text-xl font-semibold leading-tight text-[#1d1d1f]">BU Reserve</h1>
              <p className="text-sm text-[#606066]">Study Room Booking</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden rounded-full bg-[#f3dfdf] px-4 py-2 text-sm font-semibold text-[#bf1313] sm:block">
              {myBooking ? "1 booking" : "0 bookings"}
            </div>
            <span className="hidden text-sm text-[#606066] md:inline">{userEmail}</span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-full border border-[#d5d5d7] bg-white px-4 py-1.5 text-sm font-medium text-[#3b3b41] transition hover:bg-[#efefef]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <section className="mb-8 overflow-hidden rounded-2xl border border-[#d6d6d8] bg-white shadow-sm">
          <Image
            src="/banner.jpg"
            alt="Study room booking banner"
            width={1600}
            height={500}
            className="h-auto w-full object-cover"
            priority
          />
        </section>

        <div className="mb-8 inline-flex rounded-2xl bg-[#e8e8e8] p-1">
          <div
            className={`rounded-xl px-6 py-2 text-base font-medium transition ${
              myBooking ? "text-[#69696f]" : "bg-white text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.08)]"
            }`}
          >
            Book
          </div>
          <div
            className={`rounded-xl px-6 py-2 text-base font-medium transition ${
              myBooking ? "bg-white text-[#1d1d1f] shadow-[0_1px_0_rgba(0,0,0,0.08)]" : "text-[#69696f]"
            }`}
          >
            My Bookings
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <label className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#66666b]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4.5" width="18" height="16" rx="2" />
                <path d="M16 2.5v4M8 2.5v4M3 9.5h18" />
              </svg>
            </span>
            <select
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-12 rounded-2xl border border-[#ceced1] bg-white pl-11 pr-5 text-base font-medium text-[#1f1f21] shadow-sm outline-none transition focus:border-[#acacad]"
            >
              {dateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === date ? formatDateHeading(opt.value) : opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex rounded-xl bg-[#e7e7e7] p-1">
            <button
              type="button"
              onClick={() => handleDurationChange(1)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                duration === 1 ? "bg-white text-[#222225] shadow" : "text-[#69696f]"
              }`}
            >
              1 hour
            </button>
            <button
              type="button"
              onClick={() => handleDurationChange(2)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                duration === 2 ? "bg-white text-[#222225] shadow" : "text-[#69696f]"
              }`}
            >
              2 hours
            </button>
          </div>
        </div>

        {myBooking ? (
          <section className="mb-8 rounded-2xl border border-[#d6d6d7] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-[#1d1d1f]">Your booking</h2>
            <p className="text-base text-[#414148]">
              <strong>Room {myBooking.room?.name ?? "—"}</strong> (capacity {myBooking.room?.capacity ?? "—"}) •{" "}
              {new Date(myBooking.start_time).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              –{" "}
              {new Date(myBooking.end_time).toLocaleString("en-GB", { timeStyle: "short" })}
            </p>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelLoading}
              className="mt-5 rounded-xl bg-[#d40000] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b80000] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLoading ? "Cancelling…" : "Cancel booking"}
            </button>
            <p className="mt-4 text-sm text-[#6a6a70]">
              You can only have one booking at a time. Cancel this one to book another slot.
            </p>
            <p className="mt-1 text-sm text-[#6a6a70]">
              Booking is disabled while this reservation is active.
            </p>
            <p className="mt-2 text-sm text-[#47474d]">
              If someone is in your room during your reservation time, kindly show them your reservation on the website.
            </p>
          </section>
        ) : (
          <section className="mb-8 space-y-4">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_1.35fr]">
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[#5f5f65]">Choose a room</h2>
                <div className="space-y-3">
                  {roomsLoading ? (
                    <p className="rounded-2xl border border-[#d5d5d8] bg-white px-5 py-4 text-sm text-[#6a6a70]">Checking availability…</p>
                  ) : availableRooms.length === 0 ? (
                    <p className="rounded-2xl border border-[#eed2d2] bg-[#fff7f7] px-5 py-4 text-sm text-[#b92626]">
                      No rooms available for this time.
                    </p>
                  ) : (
                    availableRooms.map((r) => {
                      return (
                        <div
                          key={r.id}
                          className={`rounded-2xl border bg-white p-5 transition ${
                            bookingRoomId === r.id
                              ? "border-[#d40000] shadow-[0_0_0_2px_rgba(212,0,0,0.12)]"
                              : "border-[#d6d6d8]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-2xl font-semibold leading-tight">Room {r.name}</h3>
                              <p className="mt-1 text-sm text-[#66666c]">9th Floor</p>
                            </div>
                            <span className="rounded-full bg-[#efefef] px-3 py-1 text-xs font-semibold text-[#404046]">
                              {r.capacity}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {getRoomFeatures(r.name).map((feature) => (
                              <span
                                key={feature}
                                className="rounded-full bg-[#efefef] px-3 py-1 text-xs text-[#616168]"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => handleBookRoom(r)}
                              disabled={bookingRoomId !== null}
                              className="rounded-xl bg-[#d40000] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#bc0000] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {bookingRoomId === r.id ? "Booking…" : "Book room"}
                            </button>
                          </div>
                          {needsGroupConfirmation(r) && (
                            <p className="mt-2 text-xs text-[#7a7a81]">
                              Group room: booking requires confirmation at checkout.
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <h2 className="mb-3 text-lg font-semibold text-[#1d1d1f]">Select a time slot</h2>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#63636a]">Time slot</span>
                  <select
                    value={start}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="w-full rounded-xl border border-[#ceced1] bg-white px-3 py-2 text-sm text-[#1f1f21] outline-none transition focus:border-[#acacad]"
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} - {getEndTimeLabel(opt.value, duration)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-4 text-sm text-[#66666d]">
                  Selected date: <span className="font-semibold text-[#2a2a2f]">{formatDateHeading(date)}</span>
                </p>
                <p className="mt-1 text-sm text-[#66666d]">
                  Duration: <span className="font-semibold text-[#2a2a2f]">{duration} hour</span>
                  {duration > 1 ? "s" : ""}
                </p>
                {error && (
                  <p className="mt-3 rounded-xl border border-[#f0cdcd] bg-[#fff5f5] px-4 py-2 text-sm text-[#bd2929]">
                    {error}
                  </p>
                )}
                <div className="mt-5 text-sm text-[#66666d]">
                  Pick a room on the left after selecting your time slot.
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-[#d6d6d8] bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-[#1d1d1f]">Rooms</h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {rooms.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[#dddddf] bg-[#fafafa] p-4"
              >
                <span className="text-lg font-semibold text-[#202025]">Room {r.name}</span>
                <p className="mt-1 text-sm text-[#66666c]">Capacity: {r.capacity} (for your reference)</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-[#4f4f56]">
            Click on link{" "}
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSehjkbrGa8JZqWs4_hDgCldju9R0DN6RgLCHouS2rJv8PjLFg/viewform?usp=publish-editor"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#c70000] underline hover:text-[#9f0000]"
            >
              here
            </a>{" "}
            to report any problems.
          </p>
        </section>
      </div>
    </main>
  );
}
