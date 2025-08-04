"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: loginData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("❌ Fejl: " + error.message);
      return;
    }

    const userId = loginData.user.id;

    // Tjek om bruger findes i profiles
    const { data: profil, error: profilError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (profilError) {
      setMessage("❌ Fejl ved tjek af profil: " + profilError.message);
      return;
    }

    setMessage("✅ Du er nu logget ind!");

    if (profil) {
      router.push("/startside"); // Profil findes
    } else {
      router.push("/registrer"); // Ingen profil endnu
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setMessage("❗ Indtast din e-mail for at nulstille adgangskoden.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://dinapp.dk/opdater-adgangskode", // Skift til din rigtige URL
    });

    if (error) {
      setMessage("❌ Fejl ved nulstilling: " + error.message);
    } else {
      setMessage("📧 Tjek din e-mail for link til at nulstille adgangskoden.");
    }
  };

  return (
    <main style={styles.main}>
      <h1>Log ind</h1>
      <form onSubmit={handleLogin}>
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
          Log ind
        </button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        <button
          onClick={handleForgotPassword}
          style={{
            background: "none",
            border: "none",
            color: "#ff69b4",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          Glemt adgangskode?
        </button>
      </p>

      {message && <p>{message}</p>}

      <p style={{ marginTop: "1rem" }}>
        Har du ikke en bruger?{" "}
        <a href="/signup" style={{ color: "#ff69b4" }}>
          Opret en her
        </a>
      </p>
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

