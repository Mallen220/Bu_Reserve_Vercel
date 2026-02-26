"use client";

import { signIn } from "@/app/login/actions";
import { useActionState } from "react";
import Image from "next/image";

export default function LoginPage() {
  const [state, formAction] = useActionState(
    async (_: unknown, formData: FormData) => {
      const result = await signIn(formData);
      return result ?? null;
    },
    null as { error?: string } | null
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex justify-center">
          <Image 
            src="/bu_logo.jpg" 
            alt="BU Logo" 
            width={40} 
            height={40}
          />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-neutral-900 dark:text-white">
          KHC Room Booking
        </h1>
        <p className="mb-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Sign in with your email
        </p>
        <form action={formAction} className="space-y-4">
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-neutral-900 placeholder:text-neutral-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-red-600 py-2.5 font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          >
            Sign in
          </button>
        </form>
        {state?.error && (
          <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
      </div>
    </main>
  );
}
