"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function OpdaterAdgangskode() {
  const router = useRouter();
  const [nyAdgangskode, setNyAdgangskode] = useState("");
  const [besked, setBesked] = useState("");
  const [loading, setLoading] = useState(false);
  const [klar, setKlar] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
        } else if (url.hash) {
          const params = new URLSearchParams(url.hash.replace("#", ""));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (mounted) {
            setBesked(
              "⚠️ Linket kunne ikke oprette en aktiv session. Bed om et nyt reset-link og åbn det direkte fra e-mailen."
            );
          }
          return;
        }

        if (mounted) {
          setBesked("");
        }
      } catch (err: any) {
        if (mounted) {
          setBesked(
            "⚠️ Kunne ikke oprette session fra linket: " +
              (err?.message ?? String(err))
          );
        }
      } finally {
        if (mounted) {
          setKlar(true);
        }
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBesked("");

    if (nyAdgangskode.length < 8) {
      setBesked("❌ Adgangskoden skal mindst være 8 tegn.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: nyAdgangskode,
      });

      if (error) {
        setBesked("❌ Fejl: " + error.message);
        setLoading(false);
        return;
      }

      setBesked("✅ Adgangskoden er opdateret. Du sendes videre…");
      setLoading(false);
      setTimeout(() => {
        router.push("/startside");
      }, 1500);
    } catch (err: any) {
      setBesked("❌ Uventet fejl: " + (err?.message ?? String(err)));
      setLoading(false);
    }
  };

  return (
    <main style={styles.main}>
      <h1>Ny adgangskode</h1>
      <p style={{ marginBottom: "1rem" }}>
        Indtast din nye adgangskode herunder.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Ny adgangskode"
          value={nyAdgangskode}
          onChange={(e) => setNyAdgangskode(e.target.value)}
          style={styles.input}
          required
          minLength={8}
          disabled={!klar || loading}
        />

        <button
          type="submit"
          style={styles.button}
          disabled={!klar || loading}
        >
          {loading ? "Gemmer..." : "Gem adgangskode"}
        </button>
      </form>

      {besked && <p style={{ marginTop: "1rem" }}>{besked}</p>}
      {!besked && !klar && (
        <p style={{ marginTop: "1rem" }}>Tjekker link og opretter session…</p>
      )}
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: 500,
    margin: "3rem auto",
    padding: "2rem",
    backgroundColor: "#222",
    borderRadius: 8,
    color: "white",
    textAlign: "center",
  },
  input: {
    width: "100%",
    padding: "1rem",
    margin: "0.5rem 0",
    borderRadius: 6,
    border: "1px solid #444",
    backgroundColor: "#111",
    color: "white",
    fontSize: "1rem",
  },
  button: {
    backgroundColor: "#ff69b4",
    color: "white",
    padding: "1rem",
    borderRadius: 6,
    border: "none",
    fontWeight: "bold",
    fontSize: "1.2rem",
    cursor: "pointer",
    marginTop: "1rem",
    width: "100%",
  },
};
