"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { setSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function signIn(formData: FormData) {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email) {
    return { error: "Please enter your email." };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("allowed_emails")
    .select("email")
    .eq("email", email)
    .single();

  if (!data) {
    return { error: "This email is not allowed to access the booking system." };
  }

  await setSession(data.email);
  redirect("/dashboard");
}
