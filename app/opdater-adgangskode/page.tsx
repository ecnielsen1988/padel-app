"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function OpdaterAdgangskode() {
  const router = useRouter();
  const [nyAdgangskode, setNyAdgangskode] = useState("");
  const [besked, setBesked] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.updateUser({
      password: nyAdgangskode,
    });

    if (error) {
      setBesked("❌ Fejl: " + error.message);
      setLoading(false);
    } else {
      setBesked("✅ Adgangskoden er opdateret. Du bliver omdirigeret...");
      setTimeout(() => {
        router.push("/startside");
      }, 3000);
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
        />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Gemmer..." : "Gem adgangskode"}
        </button>
      </form>
      {besked && <p style={{ marginTop: "1rem" }}>{besked}</p>}
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
