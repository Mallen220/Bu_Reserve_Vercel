# KHC Room Booking

Room booking for KHC: rooms **910**, **911**, and **912** (each with different capacity). Built with Next.js, Supabase, and Vercel.

## Rules

- **Access**: Only emails listed in `allowed_emails` can sign in (no password, no email link—just enter your email).
- **Advance**: Bookings allowed up to **7 days** in advance.
- **Duration**: **1 or 2 hour** slots only.
- **Limit**: **One booking at a time** per user.
- **Room exclusivity**: When a room is booked for a time slot, no one else can book that same room for that time.
- **Capacity**: Room capacity is shown only so the booker knows how many people the room holds; it does not limit who can book.
- **Privacy**: Users can only see and cancel their own bookings, not others'.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migrations in order:
   - First: `supabase/migrations/20250214000000_initial_schema.sql`
   - Second: `supabase/migrations/20250214000001_bookings_use_email.sql`
3. Add allowed emails (replace with real addresses):

   ```sql
   insert into public.allowed_emails (email) values
     ('user1@example.com'),
     ('user2@example.com');
   ```

### 2. Environment

Create `.env.local` in the project root with:

- `NEXT_PUBLIC_SUPABASE_URL` – from Supabase **Project Settings → API** (Project URL).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – anon public key (same page).
- `SUPABASE_SERVICE_ROLE_KEY` – service role key (same page; keep secret, server-only).
- `SESSION_SECRET` – a long random string for signing session cookies (e.g. generate with `openssl rand -base64 32`).
- `ADMIN_EMAIL` – the email address that can access `/admin` (e.g. your own email).
- `ADMIN_PASSWORD` – password required to open the admin area after logging in as the admin; stored in env only, not in the database.
- `DEV_AUTH_BYPASS` – optional; set to `true` in local dev to skip allowlist login checks and go straight to the portal (ignored in production).
- `DEV_AUTH_BYPASS_EMAIL` – optional; email to place in the dev session when bypass is enabled (defaults to entered email, then `dev@local.test`).

In non-production, local test mode also auto-enables when `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.

Dev mode quick start (no Supabase required): set `DEV_AUTH_BYPASS=true` in `.env.local`.

### 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Sign in to book**, and continue to the portal. (`dev@local.test` is valid in all local environments.)

### 4. Deploy on Vercel

- Connect the repo to Vercel and add the same env vars (including `SUPABASE_SERVICE_ROLE_KEY` and `SESSION_SECRET`).
- No Supabase redirect URLs are needed for login (sessions are cookie-based).

## Admin

Only the email set in `ADMIN_EMAIL` can open **/admin**. After logging in as that user, you must enter **ADMIN_PASSWORD** to access the admin area. Once verified, you can add or remove allowed emails (the verification lasts 1 hour). The admin email cannot be removed from the list from the UI. The **Admin** link appears in the dashboard header only when you are logged in as the admin.

## Room capacities

Default in the migration:

- **910**: 10  
- **911**: 4  
- **912**: 10  

Edit the `insert` in the migration (or update rows in the `rooms` table) to change capacities.
