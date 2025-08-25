"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Registrer() {
  const router = useRouter();

  // Auth gate
  const [authLoading, setAuthLoading] = useState(true);
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

  // 1) Prøv at auto-logge ind, hvis der ligger tokens i URL-hashen (fra verifikationsmail)
  useEffect(() => {
    const init = async () => {
      try {
        // parse #access_token & #refresh_token fra URL (Supabase redirect)
        if (typeof window !== "undefined" && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.slice(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!error) {
              // fjern tokens fra URL, bevar evt. querystring
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname + window.location.search
              );
            }
          }
        }

        // hent session
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user ?? null;
        setUserId(user?.id || null);
        if (user?.email) setEmail(user.email);
      } finally {
        setAuthLoading(false);
      }
    };
    init();
  }, []);

  // Auto-udfyld visningsnavn
  useEffect(() => {
    if (fornavn && efternavn) {
      setVisningsnavn(`${fornavn.trim()} ${efternavn.trim()}`);
    }
  }, [fornavn, efternavn]);

  const niveauTilElo = (niveau: string) => {
    switch (niveau) {
      case "1": return 500;
      case "2": return 750;
      case "3": return 1000;
      case "4": return 1250;
      case "5": return 1500;
      case "6": return 1750;
      case "7": return 2000;
      default: return 0;
    }
  };

  const handleNiveauChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNiveau(e.target.value);
    setStartElo(niveauTilElo(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFejl("");
    setSucces("");

    // Gate igen for en sikkerheds skyld
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user || sessionError) {
      setFejl("Du er ikke logget ind i denne browser. Log ind først.");
      return;
    }

    if (!fornavn.trim() || !efternavn.trim() || !email.trim() || !niveau || !visningsnavn.trim()) {
      setFejl("Udfyld venligst alle nødvendige felter.");
      return;
    }

    // Tjek unikt visningsnavn
    const { data: eksisterende, error: visningsnavnFejl } = await supabase
      .from("profiles")
      .select("id")
      .eq("visningsnavn", visningsnavn.trim());

    if (visningsnavnFejl) {
      setFejl("Der opstod en fejl under tjek af visningsnavn.");
      return;
    }
    if (eksisterende && eksisterende.length > 0) {
      setFejl("Visningsnavnet er allerede i brug. Vælg et andet.");
      return;
    }

    // Opret profil
    const { error: profilFejl } = await supabase.from("profiles").insert({
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
      ...(fødselsdato ? { fødselsdato } : {}),
    });

    if (profilFejl) {
      console.error("Profilfejl:", profilFejl);
      setFejl("❌ Fejl ved oprettelse: " + profilFejl.message);
      return;
    }

    setSucces("Profil oprettet!");
    setTimeout(() => router.push("/startside"), 1200);
  };

  // UI gates
  if (authLoading) {
    return (
      <main style={styles.main}>
        <p>⏳ Tjekker login…</p>
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
            Du er ikke logget ind i denne browser. Åbn verifikationsmailen på **samme enhed og browser**,
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
        </section>

        {fejl && <p style={styles.error}>{fejl}</p>}
        {succes && <p style={styles.success}>{succes}</p>}

        <button type="submit" style={styles.submitButton}>
          Fuldfør oprettelse
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

