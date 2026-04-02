import { createAdminClient } from "@/utils/supabase/admin";
import { getSession } from "@/lib/session";
import { cleanupExpiredBookings } from "@/lib/booking-cleanup";
import { getLocalTestRooms, isLocalTestModeEnabled } from "@/lib/local-test-mode";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (isLocalTestModeEnabled()) {
    return (
      <DashboardClient
        rooms={getLocalTestRooms()}
        myBooking={null}
        userEmail={session.email}
      />
    );
  }

  await cleanupExpiredBookings();

  const supabase = createAdminClient();
  const { data: rooms } = await supabase.from("rooms").select("*").order("name");
  const { data: myBookings } = await supabase
    .from("bookings")
    .select("*, room:rooms(*)")
    .eq("email", session.email)
    .gte("end_time", new Date().toISOString())
    .order("start_time", { ascending: true });

  return (
    <DashboardClient
      rooms={rooms ?? []}
      myBooking={myBookings?.[0] ?? null}
      userEmail={session.email}
    />
  );
}
