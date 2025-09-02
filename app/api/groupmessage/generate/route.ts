// app/api/groupmessage/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { format } from "date-fns";
import { da } from "date-fns/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "weekly" | "monthly";

function lastThursdayRange(now = new Date()) {
  const d = new Date(now);
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const diff = jsDay >= 4 ? jsDay - 4 : jsDay + 3; // tilbage til torsdag
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

async function safeImportElo() {
  // Prøv lowercase først
  try {
    const m = await import("@/lib/beregnElo");
    return (m as any).beregnEloForKampe ?? (m as any).default ?? null;
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { kind } = (await req.json()) as { kind: Kind };
    if (!kind) {
      return NextResponse.json({ ok: false, error: "Missing kind" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let title = "";
    let sections: any = {};

    if (kind === "weekly") {
      const { start, end } = lastThursdayRange();

      const { data: sets, error: setsErr } = await supabase
        .from("newresults")
        .select("*")
        .gte("date", start.toISOString())
        .lt("date", end.toISOString())
        .order("date", { ascending: true });

      if (setsErr) throw new Error(setsErr.message);

      // Elo-top (best effort)
      let weeklyTop: Array<{ navn: string; delta: number }> = [];
      try {
        const beregnEloForKampe = await safeImportElo();
        if (beregnEloForKampe && (sets?.length ?? 0) > 0) {
          const kampe = (sets ?? []).map((s: any) => ({
            id: s.id,
            date: s.date,
            holdA1: s.holdA1, holdA2: s.holdA2,
            holdB1: s.holdB1, holdB2: s.holdB2,
            scoreA: s.scoreA, scoreB: s.scoreB,
            tieBreak: s.tieBreak, matchTieBreak: s.matchTieBreak,
          }));
          const eloRes: any = beregnEloForKampe(kampe, undefined);
          const prSaet = eloRes?.eloÆndringerPrSæt ?? eloRes?.eloAendringerPrSaet ?? [];
          const map = new Map<string, number>();
          prSaet.forEach((ændring: any) => {
            const per = ændring?.perSpiller ?? ændring?.perPlayer ?? {};
            for (const [navn, delta] of Object.entries<number>(per)) {
              map.set(navn, (map.get(navn) ?? 0) + delta);
            }
          });
          weeklyTop = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([navn, delta]) => ({ navn, delta: Math.round(delta) }));
        }
      } catch {
        // ok — så laver vi bare en tom liste → “Ingen denne gang”
      }

      const { data: fines, error: finesErr } = await supabase
        .from("club_transactions")
        .select("created_at, visningsnavn, amount_dkk, reason")
        .eq("source", "fine")
        .gte("created_at", end.toISOString())
        .order("created_at", { ascending: true });
      if (finesErr) throw new Error(finesErr.message);

      const { data: debts, error: debtsErr } = await supabase
        .from("club_debts")
        .select("*");
      if (debtsErr) throw new Error(debtsErr.message);

      const bigDebtors = (debts ?? [])
        .filter((d: any) => Number(d.balance_dkk) > 100)
        .sort((a: any, b: any) => Number(b.balance_dkk) - Number(a.balance_dkk))
        .map((d: any) => ({ navn: d.visningsnavn, beløb: Math.round(Number(d.balance_dkk)) }));

      sections = {
        dato: format(start, "EEEE d. MMMM yyyy", { locale: da }),
        weeklyTop,
        fines: (fines ?? []).map((f: any) => ({
          when: f.created_at,
          navn: f.visningsnavn,
          amount: Number(f.amount_dkk),
          reason: f.reason ?? "",
        })),
        bigDebtors,
        mobilepayBox: "2033WT",
      };

      title = `Torsdagsopdatering – ${sections.dato}`;
    }

    if (kind === "monthly") {
      const now = new Date();
      const monthLabel = format(now, "MMMM yyyy", { locale: da });
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const { data: sets, error: setsErr } = await supabase
        .from("newresults")
        .select("*")
        .gte("date", monthStart.toISOString())
        .lt("date", monthEnd.toISOString());
      if (setsErr) throw new Error(setsErr.message);

      const setsThisMonth = sets?.length ?? 0;

      const countBy = new Map<string, number>();
      (sets ?? []).forEach((s: any) => {
        [s.holdA1, s.holdA2, s.holdB1, s.holdB2].forEach((navn: string) => {
          if (!navn) return;
          countBy.set(navn, (countBy.get(navn) ?? 0) + 1);
        });
      });
      const mostActive = Array.from(countBy.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([navn, antal]) => ({ navn, antal }));

      // Elo top 3 i måneden (best effort)
      let monthlyTop: Array<{ navn: string; delta: number }> = [];
      try {
        const beregnEloForKampe = await safeImportElo();
        if (beregnEloForKampe && (sets?.length ?? 0) > 0) {
          const kampe = (sets ?? []).map((s: any) => ({
            id: s.id,
            date: s.date,
            holdA1: s.holdA1, holdA2: s.holdA2,
            holdB1: s.holdB1, holdB2: s.holdB2,
            scoreA: s.scoreA, scoreB: s.scoreB,
            tieBreak: s.tieBreak, matchTieBreak: s.matchTieBreak,
          }));
          const eloRes: any = beregnEloForKampe(kampe, undefined);
          const prSaet = eloRes?.eloÆndringerPrSæt ?? eloRes?.eloAendringerPrSaet ?? [];
          const map = new Map<string, number>();
          prSaet.forEach((ændring: any) => {
            const per = ændring?.perSpiller ?? ændring?.perPlayer ?? {};
            for (const [navn, delta] of Object.entries<number>(per)) {
              map.set(navn, (map.get(navn) ?? 0) + delta);
            }
          });
          monthlyTop = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([navn, delta]) => ({ navn, delta: Math.round(delta) }));
        }
      } catch {}

      sections = { monthLabel, setsThisMonth, mostActive, monthlyTop };
      title = `Månedsopdatering – ${monthLabel}`;
    }

    // OpenAI init først nu (så manglende key ikke crasher import)
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY mangler" }, { status: 500 });
    const openai = new OpenAI({ apiKey: key });

    const systemMsg = { role: "system" as const, content: "Du er en hjælpsom dansk padel-formidler. Svar altid i Markdown." };
    const userMsg =
      kind === "weekly"
        ? `Lav en kort, venlig *gruppebesked* i **Markdown** til torsdags-padelgruppen.
Brug præcis disse overskrifter (h3):
### Torsdags aftens top 3
### Bøder noteret siden sidst
### Skylder >100 kr. til klubkassen
### Betaling
### Røverhistorie

**Data (JSON):**
${JSON.stringify(sections, null, 2)}

Krav:
- Korte bullets under hver sektion (hvor data findes).
- Tomme lister skal have “Ingen denne gang 👍”.
- “Betaling” skal nævne: “Indbetal til MobilePay Box **2033WT**”.
- “Røverhistorie” skal være kort (2–4 linjer), humoristisk og padel-relateret.
- Max 140 ord i alt.`
        : `Lav en kort, venlig *gruppebesked* i **Markdown**.
Brug præcis disse overskrifter (h3):
### Månedens top 3
### Månedens mest aktive
### Antal spillede sæt
### Røverhistorie

**Data (JSON):**
${JSON.stringify(sections, null, 2)}

Krav:
- Korte bullets under hver sektion (hvor data findes).
- Tomme lister skal have “Ingen denne gang 👍”.
- “Røverhistorie” skal være kort (2–4 linjer), humoristisk og padel-relateret.
- Max 160 ord i alt.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [systemMsg, { role: "user", content: userMsg }],
      temperature: 0.7,
    });

    const body = completion.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ ok: true, title, body });
  } catch (err: any) {
    console.error("[groupmessage/generate] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Ukendt fejl i generate" },
      { status: 500 }
    );
  }
}

