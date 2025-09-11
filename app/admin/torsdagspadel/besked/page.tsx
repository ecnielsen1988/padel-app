'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

function MarkdownPreview({ body }: { body: string }) {
  const lines = (body ?? '').replace(/\r/g, '').split('\n')

  // Simpel markdown-ish preview: ###, punktliste og afsnit
  return (
    <article className="mt-2 text-sm leading-6">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="text-base font-semibold mt-3">
              {line.replace('### ', '')}
            </h3>
          )
        }
        if (line.startsWith('- ')) {
          return <li key={i} className="ml-6 list-disc">{line.replace('- ', '')}</li>
        }
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i} className="mt-1">{line}</p>
      })}
    </article>
  )
}

export default function Page() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setIsAdmin(false); return }

        // 1) Tjek evt. rolle i JWT app_metadata
        const jwtRole = (user as any)?.app_metadata?.rolle
        let admin = jwtRole === 'admin'

        // 2) Fallback: tjek profiles.rolle
        if (!admin) {
          const { data: me } = await (supabase.from('profiles') as any)
            .select('rolle')
            .eq('id', user.id)
            .maybeSingle()
          if ((me as any)?.rolle === 'admin') admin = true
        }

        setIsAdmin(!!admin)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResultMsg(null)

    const t = title.trim()
    const b = body.trim()
    if (!t || !b) {
      setResultMsg('Titel og besked skal udfyldes.')
      return
    }

    setSubmitting(true)
    try {
      // Kald RPC uden at snuble over typer (cast til any)
      const { data, error } = await (supabase.rpc as any)('broadcast_torsdagspadel_dm', {
        p_title: t,
        p_body: b,
        p_include_self: true,
      })

      if (error) throw error

      // Forsøg at vise antal modtagere hvis funktionen returnerer et tal
      const count =
        typeof data === 'number'
          ? data
          : typeof (data?.count) === 'number'
          ? data.count
          : undefined

      setResultMsg(count != null ? `Besked sendt ✅ (${count} modtagere)` : 'Besked sendt ✅')
      setTitle('')
      setBody('')
    } catch (err: any) {
      setResultMsg(err?.message || 'Kunne ikke sende besked.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">🟢 Admin · Torsdagspadel · Fællesbesked</h1>
        <p>Indlæser…</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-3xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">🟢 Admin · Torsdagspadel · Fællesbesked</h1>
        <p>Du har ikke adgang til denne side.</p>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">🟢 Admin · Torsdagspadel · Fællesbesked</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          className="w-full rounded-md border px-3 py-2"
          placeholder="Titel"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="grid md:grid-cols-2 gap-3">
          <textarea
            className="w-full h-72 rounded-md border px-3 py-2 font-mono text-sm"
            placeholder="Skriv din besked her (Markdown: ### Overskrift, - punkt osv.)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="w-full h-72 rounded-md border p-3 overflow-auto bg-white/50 dark:bg-zinc-900/50">
            <MarkdownPreview body={body} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !title.trim() || !body.trim()}
            className="rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-semibold px-4 py-2 disabled:opacity-50"
          >
            {submitting ? 'Sender…' : '📤 Send fællesbesked'}
          </button>
          <button
            type="button"
            onClick={() => { setTitle(''); setBody(''); setResultMsg(null) }}
            className="rounded-lg border px-4 py-2"
          >
            Nulstil
          </button>
          <span className="text-xs opacity-70">
            Målgruppe: <code>torsdagspadel = true</code> (inkl. dig selv)
          </span>
        </div>

        {resultMsg && <div className="text-sm mt-1">{resultMsg}</div>}
      </form>
    </main>
  )
}

