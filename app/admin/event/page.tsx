"use client";

import Link from "next/link";

export default function AdminEventPage() {
  return (
    <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">📅 Admin · Event</h1>

      <div className="grid gap-4 mb-8">
        <Link
          href="/admin/event/onsdag"
          className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          Onsdags-event
        </Link>

        <Link
          href="/admin/event/torsdagspadel"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          Torsdagspadel
        </Link>

        <Link
          href="/admin/event/sundays"
          className="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          Sundays
        </Link>
      </div>

      <div>
        <Link
          href="/admin"
          className="inline-block bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-2 px-4 rounded-lg"
        >
          ⬅ Tilbage til Admin
        </Link>
      </div>
    </main>
  );
}