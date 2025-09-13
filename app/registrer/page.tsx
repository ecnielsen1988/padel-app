"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Registrer() {
  const router = useRouter();

  // Auth gate
  const [authLoading, setAuthLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Form state
  const [fornavn, setFornavn] = useState("");
  const [efternavn, setEfternavn] = useState("");
  const [visningsnavn, setVisningsnavn] = useState("");
  const [email, setEmail] = useState("");
  const [fødselsdato, setFødselsdato] = useState("");
  const [koen, setKoen] = useState("");
  const [telefon, setTelefon] = useState("");
  const [niveau, setNiveau] = useState("");
  const [startElo, setStartElo] = useState(0);
  const [fejl, setFejl] = useState("");
  const [succes, setSucces] = useState("");
  const [saving, setSaving] = useState(false);

  // Hent session + forudfyld email + auto-redirect hvis allerede registreret
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;

      if (!user) {
        setUserId(null);
        setAuthLoading(false);
        return;
      }

      setUserId(user.id);
      if (user.email) setEmail(user.email);

      // Hvis user_metadata allerede siger registered → videre
      if (user.user_metadata?.registered) {
        setRedirecting(true);
        router.replace("/startside");
        return;
      }

      // Ellers: tjek om der allerede findes en profil-række (så er de reelt registreret)
      const { count: profileCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("id", user.id);

      if ((profileCount ?? 0) > 0) {
        setRedirecting(true);
        router.replace("/startside");
        return;
      }

      setAuthLoading(false);
    };
    init();
  }, [router]);

  // Auto-udfyld visningsnavn
  useEffect(() => {
    if (fornavn && efternavn) {
      setVisningsnavn(`${fornavn.trim()} ${efternavn.trim()}`);
    }
  }, [fornavn, efternavn]);

  const niveauTilElo = (n: string) => {
    switch (n) {
      case "1":
        return 500;
      case "2":
        return 750;
      case "3":
        return 1000;
      case "4":
        return 1250;
      case "5":
        return 1500;
      case "6":
        return 1750;
      case "7":
        return 2000;
      default:
        return 0;
    }
  };

  const handleNiveauChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setNiveau(v);
    setStartElo(niveauTilElo(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setFejl("");
    setSucces("");
    setSaving(true);

    try {
      // Gate igen
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user || sessionError) {
        setFejl("Du er ikke logget ind i denne browser. Log ind først.");
        setSaving(false);
        return;
      }

      if (!fornavn.trim() || !efternavn.trim() || !email.trim() || !niveau || !visningsnavn.trim()) {
        setFejl("Udfyld venligst alle nødvendige felter.");
        setSaving(false);
        return;
      }

      // Unikhedscheck (ekskludér mig selv)
      const { data: nameRow, error: nameErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("visningsnavn", visningsnavn.trim())
        .neq("id", user.id)
        .limit(1)
        .maybeSingle();

      // maybeSingle kan returnere error ved flere matches -> betragt som "navn i brug"
      if (nameErr || nameRow) {
        setFejl("Visningsnavnet er allerede i brug. Vælg et andet.");
        setSaving(false);
        return;
      }

      // Opret/Opdater profil
      const row: any = {
        id: user.id,
        fornavn,
        efternavn,
        visningsnavn: visningsnavn.trim(),
        email,
        koen,
        telefon,
        rolle: "bruger",
        niveau,
        startElo,
      };
      if (fødselsdato) row["fødselsdato"] = fødselsdato;

      const { error: profilFejl } = await supabase.from("profiles").upsert(row, { onConflict: "id" });

      if (profilFejl) {
        console.error("Profilfejl:", profilFejl);
        setFejl("❌ Fejl ved oprettelse: " + profilFejl.message);
        setSaving(false);
        return;
      }

      // Marker som registreret + gem visningsnavn i user_metadata
      const { error: metaFejl } = await supabase.auth.updateUser({
        data: { registered: true, visningsnavn: visningsnavn.trim() },
      });

      if (metaFejl) {
        setFejl("Profil gemt, men kunne ikke opdatere brugerdata: " + metaFejl.message);
        setSaving(false);
        return;
      }

      // 🔑 Force ny access token, så /startside ser registered=true
      await supabase.auth.refreshSession();

      setSucces("Profil oprettet! Sender dig videre…");
      setRedirecting(true);

      // Lille micro-wait for at sikre hydration med ny session
      await new Promise((r) => setTimeout(r, 50));

      // Viderestil
      router.replace("/startside");
    } catch (err: any) {
      console.error(err);
      setFejl("Uventet fejl — prøv igen.");
      setSaving(false);
    }
  };

  // UI gates
  if (authLoading || redirecting) {
    return (
      <main style={styles.main}>
        <p>{redirecting ? "Sender dig videre…" : "⏳ Tjekker login…"}</p>
      </main>
    );
  }

  if (!userId) {
    // Ikke logget ind → vis venlig besked og knap til login
    return (
      <main style={styles.main}>
        <h1 style={styles.heading}>Fuldfør registrering</h1>
        <div style={styles.boks}>
          <p style={{ marginBottom: "1rem" }}>
            Du er ikke logget ind i denne browser. Åbn verifikationsmailen på <strong>samme enhed og browser</strong>,
            eller log ind herunder og kom tilbage til denne side.
          </p>
          <Link
            href="/login?next=/registrer"
            className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-6 rounded-xl shadow"
          >
            Log ind
          </Link>
        </div>
      </main>
    );
  }

  // Logget ind → vis formular
  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Fuldfør registrering</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        <section style={styles.boks}>
          <h2 style={styles.boksHeading}>Personlige oplysninger*</h2>

          <label style={styles.label}>
            Fornavn:
            <input type="text" value={fornavn} onChange={(e) => setFornavn(e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Efternavn:
            <input type="text" value={efternavn} onChange={(e) => setEfternavn(e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Visningsnavn:
            <input type="text" value={visningsnavn} onChange={(e) => setVisningsnavn(e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            E-mail:
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />
          </label>
        </section>

        <section style={styles.boks}>
          <h2 style={styles.boksHeading}>Valgfrie oplysninger</h2>

          <label style={styles.label}>
            Fødselsdato:
            <input type="date" value={fødselsdato} onChange={(e) => setFødselsdato(e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Køn:
            <select value={koen} onChange={(e) => setKoen(e.target.value)} style={styles.input}>
              <option value="">-- Vælg --</option>
              <option value="mand">Mand</option>
              <option value="kvinde">Kvinde</option>
              <option value="andet">Andet</option>
            </select>
          </label>

          <label style={styles.label}>
            Telefon:
            <input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} style={styles.input} />
          </label>
        </section>

        <section style={styles.boks}>
          <h2 style={styles.boksHeading}>Padelniveau*</h2>

          <select value={niveau} onChange={handleNiveauChange} required style={styles.input}>
            <option value="">-- Vælg niveau --</option>
            <option value="1">1. Helt ny begynder - op til padelniveau 1.5</option>
            <option value="2">2. Begynder - op til padelniveau 2.0</option>
            <option value="3">3. God begynder - op til padelniveau 2.5</option>
            <option value="4">4. Let øvet - op til padelniveau 3.0</option>
            <option value="5">5. Øvet - op til padelniveau 3.5</option>
            <option value="6">6. Meget øvet - op til padelniveau 4.0</option>
            <option value="7">7. Divisionsspiller - padelniveau 4.0+</option>
          </select>

          <p style={{ marginTop: "0.5rem", opacity: 0.9 }}>
            Start Elo sættes til: <strong>{startElo}</strong>
          </p>
        </section>

        {fejl && <p style={styles.error}>{fejl}</p>}
        {succes && <p style={styles.success}>{succes}</p>}

        <button type="submit" style={styles.submitButton} disabled={saving}>
          {saving ? "Gemmer…" : "Fuldfør oprettelse"}
        </button>
      </form>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: "600px",
    margin: "3rem auto",
    padding: "2rem",
    backgroundColor: "#222",
    borderRadius: "8px",
    color: "white",
    boxShadow: "0 0 15px rgba(0,0,0,0.7)",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  heading: {
    textAlign: "center",
    marginBottom: "2rem",
    fontSize: "2.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  boks: {
    border: "1px solid #555",
    borderRadius: "8px",
    padding: "1rem 1.5rem",
    backgroundColor: "#333",
  },
  boksHeading: {
    marginBottom: "1rem",
    fontSize: "1.25rem",
    borderBottom: "1px solid #555",
    paddingBottom: "0.3rem",
  },
  label: {
    display: "block",
    marginBottom: "1rem",
    color: "white",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    marginTop: "4px",
    borderRadius: "4px",
    border: "1px solid #666",
    backgroundColor: "#111",
    color: "white",
    fontSize: "1rem",
  },
  submitButton: {
    backgroundColor: "#ff69b4",
    color: "white",
    padding: "1rem",
    borderRadius: "6px",
    fontWeight: "bold",
    fontSize: "1.25rem",
    cursor: "pointer",
    border: "none",
    transition: "background-color 0.3s ease",
  },
  error: {
    color: "#ff6666",
    fontWeight: "bold",
    textAlign: "center",
  },
  success: {
    color: "#66ff66",
    fontWeight: "bold",
    textAlign: "center",
  },
};

