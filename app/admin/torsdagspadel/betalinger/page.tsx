"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatOre } from "@/lib/torsdagEconomyV2";

type PendingFine = {
  id: string;
  reason: string;
  eventDate: string | null;
  remainingAmountOre: number;
  totalAmountOre: number;
};

type PaymentGroup = {
  playerName: string;
  expectedAmountOre: number;
  fineCount: number;
  requestedAt: string;
  fines: PendingFine[];
};

function formatDateTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminBetalingerPage() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingPlayer, setSavingPlayer] = useState<string | null>(null);
  const [receivedValues, setReceivedValues] = useState<Record<string, string>>({});

  async function loadPayments() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/torsdag/admin/payments", { cache: "no-store" });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Kunne ikke hente betalinger");
      return;
    }

    const nextPayments = (data.payments ?? []) as PaymentGroup[];
    setPayments(nextPayments);
    setReceivedValues(
      Object.fromEntries(nextPayments.map((payment) => [payment.playerName, String(payment.expectedAmountOre / 100)]))
    );
  }

  useEffect(() => {
    void loadPayments();
  }, []);

  async function confirmPayment(playerName: string, expectedAmountOre: number) {
    const value = String(receivedValues[playerName] ?? "").replace(",", ".");
    const receivedAmount = Number(value);
    if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {
      setError("Skriv et gyldigt modtaget beløb.");
      return;
    }

    setSavingPlayer(playerName);
    setError(null);
    setSuccess(null);

    const receivedAmountOre = Math.round(receivedAmount * 100);
    const res = await fetch("/api/torsdag/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, receivedAmountOre }),
    });
    const data = await res.json();
    setSavingPlayer(null);

    if (!res.ok) {
      setError(data.error ?? "Kunne ikke gemme betalingen");
      return;
    }

    setSuccess(
      receivedAmountOre === expectedAmountOre
        ? `${playerName}: betaling godkendt`
        : `${playerName}: modtaget ${formatOre(receivedAmountOre)} af ${formatOre(expectedAmountOre)}`
    );
    await loadPayments();
  }

  return (
    <main className="mx-auto max-w-6xl p-4 text-gray-900">
      <div className="rounded-[28px] bg-gradient-to-br from-amber-600 via-orange-500 to-amber-400 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/75">Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Betalinger</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/85">
              Her godkender du forventede MobilePay-indbetalinger og kan rette beløbet, hvis der kommer mindre ind end forventet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/torsdagspadel" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white">
              ← Torsdagspadel
            </Link>
            <button
              type="button"
              onClick={() => void loadPayments()}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-700"
            >
              Opdater
            </button>
          </div>
        </div>
      </div>

      {(error || success) && (
        <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error ?? success}
        </div>
      )}

      {loading ? (
        <div className="mt-5 rounded-[28px] border border-amber-100 bg-white p-6">Indlæser betalinger…</div>
      ) : payments.length === 0 ? (
        <div className="mt-5 rounded-[28px] border border-dashed border-amber-200 bg-white p-8 text-center text-sm text-zinc-600">
          Ingen afventende betalinger lige nu.
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {payments.map((payment) => (
            <section key={payment.playerName} className="rounded-[28px] border border-amber-100 bg-white p-5 shadow-[0_20px_60px_rgba(217,119,6,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Forventet indbetaling</p>
                  <h2 className="mt-1 text-2xl font-black text-zinc-950">{payment.playerName}</h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    {payment.fineCount} bøder afventer siden {formatDateTime(payment.requestedAt)}
                  </p>
                </div>
                <div className="rounded-[22px] bg-amber-50 px-4 py-4 text-right">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Forventet</div>
                  <div className="mt-2 text-3xl font-black text-amber-950">{formatOre(payment.expectedAmountOre)}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {payment.fines.map((fine) => (
                  <div key={fine.id} className="flex items-center justify-between rounded-[20px] border border-zinc-100 bg-zinc-50 px-4 py-3">
                    <div>
                      <div className="font-bold text-zinc-900">{fine.reason}</div>
                      <div className="text-xs text-zinc-500">{fine.eventDate ?? "Uden dato"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-amber-800">{formatOre(fine.remainingAmountOre)}</div>
                      {fine.remainingAmountOre !== fine.totalAmountOre && (
                        <div className="text-xs text-zinc-500">af {formatOre(fine.totalAmountOre)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[0.8fr_auto]">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Modtaget beløb</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receivedValues[payment.playerName] ?? ""}
                    onChange={(event) =>
                      setReceivedValues((prev) => ({ ...prev, [payment.playerName]: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-amber-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void confirmPayment(payment.playerName, payment.expectedAmountOre)}
                  disabled={savingPlayer === payment.playerName}
                  className="rounded-2xl bg-amber-500 px-5 py-3 font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPlayer === payment.playerName ? "Gemmer…" : "Godkend betaling"}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
