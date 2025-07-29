"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function VelkommenPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [besked, setBesked] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/velkommen`,
      },
    });

    if (error) {
      setBesked("Der opstod en fejl: " + error.message);
    } else {
      setBesked("Tjek din e-mail og bekræft din konto.");
    }
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
        <button type="submit" style={styles.button}>
          Opret konto
        </button>
      </form>
      {besked && <p>{besked}</p>}
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
