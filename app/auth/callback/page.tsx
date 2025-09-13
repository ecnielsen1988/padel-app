// app/auth/callback/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "loading" | "ok" | "error" | "done";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState<string>("Bekræfter din konto…");

  // Kun interne redirects er tilladt (for at undgå open redirect)
  const safeNext = (raw: string | null): string => {
    const next = raw || "/";
    try {
      // tillad kun relative paths
      if (next.startsWith("/")) return next;
      return "/";
    } catch {
      return "/";
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const code = searchParams.get("code");
      const next = safeNext(searchParams.get("next"));

      // Hvis vi allerede HAR en session, spring udveksling over
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session && !code) {
        setStatus("ok");
        router.replace(next);
        return;
      }

      if (!code) {
        setStatus("error");
        setMsg("Mangler verifikationskode i URL’en. Åbn linket fra mailen igen.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (error) {
        console.error("exchangeCodeForSession error:", error);
        setStatus("error");
        setMsg("Kunne ikke bekræfte linket. Prøv igen fra mailen.");
        return;
      }

      setStatus("ok");
      setMsg("Logger ind…");
      router.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  return (
    <main style={{ maxWidth: 600, margin: "4rem auto", textAlign: "center" }}>
      {status === "loading" && <p>{msg}</p>}
      {status === "ok" && <p>{msg}</p>}
      {status === "error" && (
        <>
          <p style={{ marginBottom: "1rem" }}>{msg}</p>
          <p>
            Alternativt kan du <a href="/login?next=/registrer" style={{ color: "#ff69b4", fontWeight: 600 }}>
              logge ind manuelt
            </a>.
          </p>
        </>
      )}
      {status === "done" && <p>Færdig.</p>}
    </main>
  );
}
