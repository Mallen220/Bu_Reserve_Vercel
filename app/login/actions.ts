"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { setSession } from "@/lib/session";
import { isTrustedDeviceForEmail } from "@/lib/device-trust";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function getBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing NEXT_PUBLIC_SITE_URL for production login callback.");
  }
  return "http://localhost:3000";
}

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

  const isTrusted = await isTrustedDeviceForEmail(data.email);
  if (isTrusted) {
    await setSession(data.email);
    redirect("/dashboard");
  }

  const authClient = await createClient();
  const redirectTo = `${await getBaseUrl()}/auth/callback`;
  const { error } = await authClient.auth.signInWithOtp({
    email: data.email,
    options: {
      emailRedirectTo: redirectTo,
      // Allow first login to create auth user after allowlist check passes.
      shouldCreateUser: true,
    },
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("redirect")) {
      return { error: "Auth redirect URL is not allowed. Add your /auth/callback URL in Supabase Auth settings." };
    }
    if (msg.includes("email") && msg.includes("disabled")) {
      return { error: "Supabase email auth is disabled. Enable Email provider in Supabase Auth settings." };
    }
    if (msg.includes("rate limit")) {
      return { error: "Too many auth emails sent recently. Please wait and try again." };
    }
    console.error("signInWithOtp error:", error.message);
    return { error: `Unable to send confirmation email right now. ${error.message}` };
  }
  return { success: "New device detected. Check your email for the confirmation link." };
}
