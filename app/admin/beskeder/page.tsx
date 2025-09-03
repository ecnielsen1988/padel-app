'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

function MarkdownPreview({ body }: { body: string }) {
  const lines = body.split('
')
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
          return (
            <li key={i} className="ml-6 list-disc">{line.replace('- ', '')}</li>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i} className="mt-1">{line}</p>
      })}
    </article>
  )
}

export default function Page() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<InboxRow[]>([])
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function load() {
    setErrMsg(null)
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) {
      setRows([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, title, body, delivered_at, read_at, sender_name')
      .eq('recipient_id', user.id) // vigtigt: hent KUN mine beskeder
      .order('delivered_at', { ascending: false })
    if (error) {
      setErrMsg(error.message)
      setRows([])
    } else {
      setRows((data as InboxRow[]) || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()

    // (valgfrit) realtime opdatering hvis du har slået Realtime til for tabellen
    const channel = supabase
      .channel('inbox_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inbox_messages' }, (payload) => {
        setRows(prev => [{
          id: (payload.new as any).id,
          title: (payload.new as any).title,
          body: (payload.new as any).body,
          delivered_at: (payload.new as any).delivered_at,
          read_at: (payload.new as any).read_at,
          sender_name: (payload.new as any).sender_name,
        }, ...prev])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function markRead(id: string) {
    const { error } = await supabase
      .from('inbox_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, read_at: new Date().toISOString() } : r))
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">📨 Beskeder</h1>

      {loading && <p>Indlæser…</p>}
      {errMsg && <p className="text-red-600">{errMsg}</p>}

      {!loading && rows.length === 0 && (
        <p className="opacity-70">Ingen beskeder endnu.</p>
      )}

      <ul className="space-y-4">
        {rows.map(row => (
          <li key={row.id} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs opacity-70">
                  {new Date(row.delivered_at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}
                </div>
                <h2 className="text-lg font-semibold mt-1">{row.title}</h2>
                <div className="text-sm opacity-80">Fra: {row.sender_name || 'Admin'}</div>
                <div className="mt-2">
                  <MarkdownPreview body={row.body} />
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {!row.read_at ? (
                  <button
                    onClick={() => markRead(row.id)}
                    className="rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-3 py-1"
                  >
                    Markér som læst
                  </button>
                ) : (
                  <span className="text-xs opacity-70">Læst</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
