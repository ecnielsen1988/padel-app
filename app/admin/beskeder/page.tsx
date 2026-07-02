"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  formatResultChangeSetSummary,
  parseResultChangeRequest,
} from "@/lib/resultChangeRequests";

type AdminMessage = {
  id: number;
  kampid: number | null;
  besked: string;
  tidspunkt: string;
  visningsnavn: string;
  handled: boolean;
};

type ProfileRow = {
  rolle: "admin" | "netværk" | "spiller" | null;
};

function formatTimeAgo(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  return `${days} d siden`;
}

async function fetchAdminMessages() {
  const primary = await supabase
    .from("admin_messages")
    .select("id, kampid, besked, tidspunkt, visningsnavn, læst")
    .order("tidspunkt", { ascending: false });

  if (!primary.error) {
    return ((primary.data ?? []) as any[]).map((message) => ({
      id: Number(message.id),
      kampid: message.kampid == null ? null : Number(message.kampid),
      besked: String(message.besked ?? ""),
      tidspunkt: String(message.tidspunkt ?? ""),
      visningsnavn: String(message.visningsnavn ?? ""),
      handled: !!message.læst,
    })) as AdminMessage[];
  }

  const fallback = await supabase
    .from("admin_messages")
    .select("id, kampid, besked, tidspunkt, visningsnavn, read")
    .order("tidspunkt", { ascending: false });

  if (fallback.error) {
    throw fallback.error;
  }

  return ((fallback.data ?? []) as any[]).map((message) => ({
    id: Number(message.id),
    kampid: message.kampid == null ? null : Number(message.kampid),
    besked: String(message.besked ?? ""),
    tidspunkt: String(message.tidspunkt ?? ""),
    visningsnavn: String(message.visningsnavn ?? ""),
    handled: !!message.read,
  })) as AdminMessage[];
}

export default function AdminBeskeder() {
  const [beskeder, setBeskeder] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adgangTilladt, setAdgangTilladt] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: auth, error: userError } = await supabase.auth.getUser();
      const user = auth?.user;
      if (userError || !user) {
        setAdgangTilladt(false);
        setLoading(false);
        return;
      }

      const { data: profil, error: profilError } = await supabase
        .from("profiles")
        .select("rolle")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (profilError || profil?.rolle !== "admin") {
        setAdgangTilladt(false);
        setLoading(false);
        return;
      }

      setAdgangTilladt(true);

      try {
        const data = await fetchAdminMessages();
        setBeskeder(data);
      } catch (error) {
        console.error("Kunne ikke hente admin-beskeder:", error);
        setBeskeder([]);
      }

      setLoading(false);
    }

    void load();
  }, []);

  const åbneBeskeder = useMemo(
    () => beskeder.filter((message) => !message.handled),
    [beskeder]
  );

  const håndteredeBeskeder = useMemo(
    () => beskeder.filter((message) => message.handled),
    [beskeder]
  );

  async function handleMessage(id: number, action: "approve" | "dismiss") {
    setBusyId(id);
    try {
      const res = await fetch("/api/result-change-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: id, action }),
      });
      const data = await res.json();

      if (!res.ok) {
        console.error("Kunne ikke håndtere besked:", data);
        return;
      }

      setBeskeder((prev) =>
        prev.map((message) =>
          message.id === id ? { ...message, handled: true } : message
        )
      );
    } catch (error) {
      console.error("Uventet fejl ved håndtering af besked:", error);
    } finally {
      setBusyId(null);
    }
  }

  function renderMessageCard(message: AdminMessage) {
    const parsed = parseResultChangeRequest(message.besked);

    return (
      <div
        key={message.id}
        className={`rounded-[18px] border p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${
          message.handled
            ? "border-[#e8ebf0] bg-[#f7f8fa]"
            : "border-[#ffd58d] bg-gradient-to-br from-[#fff6dc] via-[#fff2c8] to-[#ffe7a8]"
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#232833]">
              {message.visningsnavn || "Ukendt spiller"}
            </p>
            <p className="text-xs font-semibold text-[#8b92a0]">
              Kamp #{message.kampid ?? "?"}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-[#7a818f]">
            {formatTimeAgo(message.tidspunkt)}
          </span>
        </div>

        {parsed ? (
          <>
            <p className="text-sm font-semibold text-[#232833]">
              Foreslået resultat: {formatResultChangeSetSummary(parsed.sets)}
            </p>
            {parsed.comment ? (
              <p className="mt-1 text-sm text-[#5f6673]">{parsed.comment}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-[#5f6673]">{message.besked}</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
              message.handled
                ? "bg-[#e6ebf3] text-[#586171]"
                : "bg-white/70 text-[#9a5d00]"
            }`}
          >
            {message.handled ? "Håndteret" : "Åben"}
          </span>

          {!message.handled ? (
            <div className="flex items-center gap-2">
              {!parsed ? (
                <button
                  type="button"
                  onClick={() => handleMessage(message.id, "dismiss")}
                  disabled={busyId === message.id}
                  className="inline-flex items-center justify-center rounded-full bg-[#8f96a3] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#7c8492] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === message.id ? "Gemmer..." : "Marker håndteret"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  handleMessage(message.id, parsed ? "approve" : "dismiss")
                }
                disabled={busyId === message.id}
                className="inline-flex items-center justify-center rounded-full bg-[#f01f78] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#d21869] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === message.id
                  ? "Gemmer..."
                  : parsed
                    ? "Godkend ændring"
                    : "Luk"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (adgangTilladt === false) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="rounded-[16px] bg-[#fff1f1] p-4 text-sm font-semibold text-[#b42318]">
          Du har ikke adgang til denne side.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a5d00]">
            Admin
          </p>
          <h1 className="text-2xl font-black tracking-tight text-[#1f2430]">
            Fejlmeldte resultater
          </h1>
        </div>
        <Link href="/startside" className="text-sm font-bold text-[#f01f78]">
          Tilbage til start
        </Link>
      </div>

      {loading ? <p className="text-sm text-[#6d7280]">Indlæser...</p> : null}

      {!loading ? (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[#2d3340]">
                Åbne sager
              </h2>
              <span className="rounded-full bg-[#fff3f8] px-3 py-1 text-[11px] font-bold text-[#c0135a]">
                {åbneBeskeder.length}
              </span>
            </div>
            {åbneBeskeder.length > 0 ? (
              <div className="space-y-3">{åbneBeskeder.map(renderMessageCard)}</div>
            ) : (
              <p className="text-sm text-[#8b92a0]">Ingen åbne fejlmeldinger.</p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[#2d3340]">
                Historik
              </h2>
              <span className="rounded-full bg-[#eef2f7] px-3 py-1 text-[11px] font-bold text-[#5f6673]">
                {håndteredeBeskeder.length}
              </span>
            </div>
            {håndteredeBeskeder.length > 0 ? (
              <div className="space-y-3">
                {håndteredeBeskeder.map(renderMessageCard)}
              </div>
            ) : (
              <p className="text-sm text-[#8b92a0]">Ingen historik endnu.</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
