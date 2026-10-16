"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
    if (authError) { setError("El correo o la contraseña no son correctos."); setLoading(false); return; }
    const returnTo = searchParams.get("returnTo");
    router.replace(returnTo?.startsWith("/") ? returnTo : "/");
    router.refresh();
  }

  return <main className="min-h-screen bg-[#fbf7f8] px-5 py-10 flex items-center justify-center">
    <section className="w-full max-w-md overflow-hidden rounded-[32px] border border-[#eadde1] bg-white shadow-[0_24px_70px_rgba(63,38,48,0.14)]">
      <div className="bg-[#3f2931] px-8 py-10 text-white">
        <Image src="/munna-gelateria.jpg" alt="Münna" width={150} height={55} className="mb-7 h-auto w-36 rounded-md" priority />
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#ef9abb]">Sistema ORG</p>
        <h1 className="text-3xl font-bold">Control de fábrica</h1>
        <p className="mt-3 text-sm leading-6 text-[#eadde1]">Ingresá con el usuario asignado para acceder a tus áreas de trabajo.</p>
      </div>
      <form onSubmit={signIn} className="space-y-5 p-8">
        <label className="block text-sm font-semibold text-[#3f2931]">Correo
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-[#ddcdd2] px-4 py-3 outline-none transition focus:border-[#da7299] focus:ring-4 focus:ring-[#f8e3eb]" />
        </label>
        <label className="block text-sm font-semibold text-[#3f2931]">Contraseña
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-2xl border border-[#ddcdd2] px-4 py-3 outline-none transition focus:border-[#da7299] focus:ring-4 focus:ring-[#f8e3eb]" />
        </label>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="w-full rounded-2xl bg-[#e887ab] px-4 py-3.5 font-semibold text-[#3f2931] transition hover:bg-[#df789f] disabled:opacity-60">{loading ? "Ingresando…" : "Ingresar"}</button>
      </form>
    </section>
  </main>;
}
