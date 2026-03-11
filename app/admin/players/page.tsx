"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type PlayerRow = {
  id: string;
  visningsnavn: string | null;
  email: string | null;
  status: "active" | "sleep" | "inactive" | null;
};

export default function AdminPlayersPage() {
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, visningsnavn, email, status")
        .order("visningsnavn", { ascending: true });

      if (error) {
        console.error("Fejl ved hentning af profiler:", error.message);
        setRows([]);
      } else {
        const clean = ((data ?? []) as PlayerRow[]).map((r) => ({
          id: r.id,
          visningsnavn: (r.visningsnavn ?? "").toString().trim() || null,
          email: (r.email ?? "").toString().trim() || null,
          status: r.status ?? null,
        }));

        setRows(clean);
      }

      setLoading(false);
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const navn = (r.visningsnavn ?? "").toLowerCase();
      const mail = (r.email ?? "").toLowerCase();
      const status = (r.status ?? "").toLowerCase();
      return navn.includes(q) || mail.includes(q) || status.includes(q);
    });
  }, [rows, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const sleep = rows.filter((r) => r.status === "sleep").length;
    const inactive = rows.filter((r) => r.status === "inactive").length;

    return { total, active, sleep, inactive };
  }, [rows]);

  const statusBadge = (status: PlayerRow["status"]) => {
    if (status === "active") {
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    }
    if (status === "sleep") {
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    }
    if (status === "inactive") {
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  };

  return (
    <main className="min-h-screen bg-white dark:bg-[#121212] text-gray-900 dark:text-white px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-pink-600">
            👥 Admin · Spillere
          </h1>
          <Link
            href="/admin"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            ← Til admin
          </Link>
        </div>

        {/* Statistik */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Alle profiler" value={stats.total} />
          <StatCard label="Active" value={stats.active} />
          <StatCard label="Sleep" value={stats.sleep} />
          <StatCard label="Inactive" value={stats.inactive} />
        </div>

        {/* Søgning */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Søg på navn, e-mail eller status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border px-3 py-2 bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-800 outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>

        {/* Liste */}
        <div className="rounded-2xl border border-pink-200 dark:border-pink-900/50 overflow-hidden bg-white dark:bg-zinc-900">
          {loading ? (
            <div className="p-6 text-center opacity-70">Indlæser spillere…</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-center opacity-70">Ingen spillere fundet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-pink-50 dark:bg-pink-900/20">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Visningsnavn</th>
                    <th className="text-left px-4 py-3 font-semibold">E-mail</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((player) => (
                    <tr
                      key={player.id}
                      className="border-t border-pink-100 dark:border-pink-900/20"
                    >
                      <td className="px-4 py-3 font-medium">
                        {player.visningsnavn || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {player.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
                            player.status
                          )}`}
                        >
                          {player.status || "ukendt"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs opacity-60">
          Viser {filteredRows.length} af {rows.length} spillere
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-pink-200 dark:border-pink-900/50 bg-pink-50/60 dark:bg-pink-900/10 p-4">
      <div className="text-sm opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold text-pink-600">{value}</div>
    </div>
  );
}