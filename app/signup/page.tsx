"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";

export default function VelkommenPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [besked, setBesked] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setBesked("");
    setLoading(true);

    if (password !== confirmPassword) {
      setBesked("❗ Adgangskoderne matcher ikke.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // VIGTIGT: Land på callback, som udveksler code→session, og send derefter videre til /registrer
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/registrer`,
      },
    });

    if (error) {
      setBesked("Der opstod en fejl: " + error.message);
      setLoading(false);
      return;
    }

    setBesked(
      "Vi har sendt dig en bekræftelsesmail. Klik på linket i mailen for at fortsætte oprettelsen."
    );
    setLoading(false);
  };

  return (
    <main style={styles.main}>
      <h1>Opret konto</h1>
      <form onSubmit={handleSignup}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Adgangskode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Gentag adgangskode"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={styles.input}
          required
        />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Sender..." : "Opret konto"}
        </button>
      </form>

      {besked && <p style={{ marginTop: "1rem" }}>{besked}</p>}

      <Link href="/login">
        <button style={{ ...styles.button, backgroundColor: "#444", marginTop: "1rem" }}>
          Gå til login
        </button>
      </Link>
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
  },
};
