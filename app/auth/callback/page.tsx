"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading"|"ok"|"error">("loading");

  useEffect(() => {
    (async () => {
      const code = searchParams.get("code");
      const next = searchParams.get("next") || "/";

      if (!code) {
        setStatus("error");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("exchangeCodeForSession error:", error);
        setStatus("error");
        return;
      }

      setStatus("ok");
      router.replace(next);
    })();
  }, [searchParams, router]);

  return (
    <main style={{maxWidth:600,margin:"4rem auto",textAlign:"center"}}>
      {status === "loading" && <p>Bekræfter din konto…</p>}
      {status === "ok" && <p>Logger ind…</p>}
      {status === "error" && <p>Kunne ikke bekræfte linket. Prøv igen fra mailen.</p>}
    </main>
  );
}
