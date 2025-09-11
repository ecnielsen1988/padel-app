// app/newscore/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import Select from 'react-select'

// --- Typer
export type SpillerOption = { value: string; label: string }
export type SaetState = {
  date: string
  holdA1: string | null
  holdA2: string | null
  holdB1: string | null
  holdB2: string | null
  scoreA: number
  scoreB: number
}

type ProfileNameRow = { visningsnavn: string | null }

// Gyldige “færdigspillet” sæt (klassisk padel/tennis logik)
const VALID_FINISHES = new Set([
  '6-0','6-1','6-2','6-3','6-4','7-5','7-6',
  '0-6','1-6','2-6','3-6','4-6','5-7','6-7',
])

function isFinished(a: number, b: number) {
  return VALID_FINISHES.has(`${a}-${b}`)
}

function emptySet(today = new Date()) : SaetState {
  return {
    date: today.toISOString().split('T')[0],
    holdA1: null, holdA2: null, holdB1: null, holdB2: null,
    scoreA: 0, scoreB: 0,
  }
}

export default function NewScorePage() {
  const [spillere, setSpillere] = useState<SpillerOption[]>([])
  const [aktivtSaet, setAktivtSaet] = useState<SaetState>(emptySet())
  const [afsluttedeSaet, setAfsluttedeSaet] = useState<SaetState[]>([])
  const [message, setMessage] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Hent spillere (visningsnavn) én gang
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .order('visningsnavn', { ascending: true })

      if (!error) {
        setSpillere((data || []).map((s: any) => {
          const v = (s?.visningsnavn ?? '').toString()
          return { value: v, label: v }
        }))
      }
    })()
  }, [])

  // Detect dark mode (for læsbar react-select)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const rootHasDark = () => document.documentElement.classList.contains('dark')
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(rootHasDark() || mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsDark(rootHasDark() || e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Begræns senere sæt til spillerne fra første sæt
  const restrictedOptions = useMemo(() => {
    if (afsluttedeSaet.length === 0) return null
    const first = afsluttedeSaet[0]
    const ids = [first.holdA1, first.holdA2, first.holdB1, first.holdB2].filter(Boolean) as string[]
    return spillere.filter(o => ids.includes(o.value))
  }, [afsluttedeSaet, spillere])

  // Helpers
  const allPlayersSelected = (s: SaetState) => !!(s.holdA1 && s.holdA2 && s.holdB1 && s.holdB2)
  const canAddSet = allPlayersSelected(aktivtSaet)
  const canSubmit = () => {
    const all = [...afsluttedeSaet, aktivtSaet]
    const rows = all.filter(s => !(s.scoreA === 0 && s.scoreB === 0))
    return rows.length > 0 && rows.every(s => allPlayersSelected(s) && s.date)
  }

  function updateField<K extends keyof SaetState>(field: K, value: SaetState[K]) {
    setAktivtSaet(prev => ({ ...prev, [field]: value }))
  }

  // Auto-swap: hvis man vælger en spiller der allerede er på modstanderholdet,
  // bytter vi automatisk plads med den gamle spiller i dette felt.
  function setPlayer(field: 'holdA1'|'holdA2'|'holdB1'|'holdB2', newVal: string | null) {
    setAktivtSaet(prev => {
      const oldVal = prev[field]
      const next: SaetState = { ...prev, [field]: newVal }
      if (!newVal || !oldVal || newVal === oldVal) return next

      const otherFields: Array<keyof SaetState> = ['holdA1','holdA2','holdB1','holdB2']
      for (const f of otherFields) {
        if (f === field) continue
        if (prev[f] === newVal) {
          ;(next as any)[f] = oldVal
          break
        }
      }
      return next
    })
  }

  function addSet() {
    setAfsluttedeSaet(prev => [...prev, aktivtSaet])
    setAktivtSaet(prev => ({ ...prev, scoreA: 0, scoreB: 0 }))
  }

  function removeSet(i: number) {
    setAfsluttedeSaet(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit()) return
    setBusy(true)
    setMessage('')

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { setBusy(false); setMessage('❌ Du skal være logget ind.'); return }

    const { data: profil, error: profilError } = await supabase
      .from('profiles')
      .select('visningsnavn')
      .eq('id', user.id)
      .maybeSingle<ProfileNameRow>()
    if (profilError || !profil?.visningsnavn) { setBusy(false); setMessage('❌ Kunne ikke finde visningsnavn.'); return }
    const visningsnavn = (profil.visningsnavn ?? '').toString().trim()

    type KampIdRow = { kampid: number | null }

const { data: maxData, error: maxError } = await supabase
  .from('newresults')
  .select('kampid')
  .not('kampid', 'is', null)
  .order('kampid', { ascending: false })
  .limit(1)

if (maxError) { setBusy(false); setMessage('❌ Fejl ved hentning af kampid: ' + maxError.message); return }

const lastKampid = Number(((maxData as KampIdRow[] | null)?.[0]?.kampid) ?? 0)
const nyKampid = (Number.isFinite(lastKampid) ? lastKampid : 0) + 1


    const all = [...afsluttedeSaet, aktivtSaet]
    const rows = all
      .filter(s => !(s.scoreA === 0 && s.scoreB === 0))
      .map(s => ({
        date: s.date,
        holdA1: s.holdA1,
        holdA2: s.holdA2,
        holdB1: s.holdB1,
        holdB2: s.holdB2,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
        finish: isFinished(s.scoreA, s.scoreB),
        event: false,
        tiebreak: 'ingen',
        kampid: nyKampid,
        indberettet_af: visningsnavn,
      }))

    // TS-fix: cast kanal som any (undgår streng row-type på insert)
    const { error } = await (supabase.from('newresults') as any).insert(rows as any)
    if (error) {
      setMessage('❌ Fejl: ' + error.message)
    } else {
      setMessage(`✅ Resultater indsendt! 🏆 Kamp ID: ${nyKampid}`)
      setAfsluttedeSaet([])
      setAktivtSaet(emptySet())
    }
    setBusy(false)
  }

  function nameFor(val: string | null) {
    if (!val) return 'Ukendt'
    return spillere.find(s => s.value === val)?.label || val
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#121212] text-gray-900 dark:text-white">
      <div className="mx-auto max-w-md px-3 py-4 text-[14px]">
        {/* Header */}
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-base font-bold tracking-tight">🎾 Indtast resultater</h1>
          <Link href="/startside" className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-zinc-800">← Til start</Link>
        </header>

        {/* Tidligere sæt */}
        {afsluttedeSaet.length > 0 && (
          <section className="mb-3 rounded-xl border border-pink-300/40 bg-pink-50/60 dark:bg-pink-900/15 p-2">
            <div className="text-xs font-semibold mb-1">Tidligere sæt</div>
            <ul className="space-y-1.5">
              {afsluttedeSaet.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-zinc-900 p-2 shadow-sm">
                  <div className="text-[13px]">
                    <div className="font-medium">Sæt #{i+1} • {s.date}</div>
                    <div className="opacity-80">
                      {nameFor(s.holdA1)} & {nameFor(s.holdA2)} <span className="opacity-60">vs</span> {nameFor(s.holdB1)} & {nameFor(s.holdB2)} — <span className="font-semibold">{s.scoreA}-{s.scoreB}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeSet(i)} className="rounded-md border px-2 py-1 text-[11px] hover:bg-red-50 dark:hover:bg-red-900/20">🗑 Fjern</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Aktivt sæt */}
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div className="rounded-xl border p-2.5 bg-white dark:bg-zinc-900 shadow">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-base font-semibold">Sæt #{afsluttedeSaet.length + 1}</h2>
              <div className="ml-auto">
                <input
                  type="date"
                  className="rounded-md border px-2 py-1.5 text-[16px] bg-white/80 dark:bg-zinc-800"
                  value={aktivtSaet.date}
                  onChange={(e) => updateField('date', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2.5">
              {/* Hold A */}
              <div className="rounded-lg border p-2.5">
                <div className="font-semibold mb-1.5 text-sm">Hold A</div>
                <PlayerSelect
                  label="Spiller A1"
                  firstSet={afsluttedeSaet.length === 0}
                  value={aktivtSaet.holdA1}
                  options={afsluttedeSaet.length === 0 ? spillere : (restrictedOptions || [])}
                  onChange={(v) => setPlayer('holdA1', v)}
                  isDark={isDark}
                />
                <PlayerSelect
                  label="Spiller A2"
                  firstSet={afsluttedeSaet.length === 0}
                  value={aktivtSaet.holdA2}
                  options={afsluttedeSaet.length === 0 ? spillere : (restrictedOptions || [])}
                  onChange={(v) => setPlayer('holdA2', v)}
                  isDark={isDark}
                />
                <ScoreGrid value={aktivtSaet.scoreA} onPick={(n) => updateField('scoreA', n)} />
              </div>

              {/* Hold B */}
              <div className="rounded-lg border p-2.5">
                <div className="font-semibold mb-1.5 text-sm">Hold B</div>
                <PlayerSelect
                  label="Spiller B1"
                  firstSet={afsluttedeSaet.length === 0}
                  value={aktivtSaet.holdB1}
                  options={afsluttedeSaet.length === 0 ? spillere : (restrictedOptions || [])}
                  onChange={(v) => setPlayer('holdB1', v)}
                  isDark={isDark}
                />
                <PlayerSelect
                  label="Spiller B2"
                  firstSet={afsluttedeSaet.length === 0}
                  value={aktivtSaet.holdB2}
                  options={afsluttedeSaet.length === 0 ? spillere : (restrictedOptions || [])}
                  onChange={(v) => setPlayer('holdB2', v)}
                  isDark={isDark}
                />
                <ScoreGrid value={aktivtSaet.scoreB} onPick={(n) => updateField('scoreB', n)} />
              </div>
            </div>
          </div>

          {/* Actionbar – mobilvenlig */}
          <div className="sticky bottom-3 md:static md:bottom-auto">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canAddSet}
                onClick={addSet}
                className="flex-1 h-9 rounded-xl bg-pink-600 disabled:opacity-50 hover:bg-pink-700 text-white font-semibold text-xs"
              >
                ➕ Tilføj sæt
              </button>
              <button
                type="submit"
                disabled={!canSubmit() || busy}
                className="flex-1 h-9 rounded-xl bg-green-600 disabled:opacity-50 hover:bg-green-700 text-white font-semibold text-xs"
              >
                {busy ? 'Indsender…' : 'Indsend resultater'}
              </button>
            </div>
            <p className="mt-1 text-[10px] opacity-70">Tip: Tilføj flere sæt før du indsender – de samles under samme kamp-ID.</p>
          </div>
        </form>

        {message && (
          <div className="mt-3 rounded-xl border p-2.5 bg-white dark:bg-zinc-900 shadow">
            <div className={message.startsWith('❌') ? 'text-red-600' : 'text-pink-600 font-semibold'}>{message}</div>
            {message.startsWith('✅') && (
              <div className="mt-1.5 flex gap-2 text-xs">
                <Link href="/mine" className="underline">Se mine resultater</Link>
                <span>·</span>
                <Link href="/lastgames" className="underline">Se seneste</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

// --- Små UI-komponenter
function ScoreGrid({ value, onPick }: { value: number, onPick: (n: number) => void }) {
  const Btn = ({ n }: { n: number }) => (
    <button
      type="button"
      onClick={() => onPick(n)}
      className={`h-8 rounded-lg border text-xs ${value===n ? 'bg-pink-600 text-white border-pink-600' : 'bg-white dark:bg-zinc-800'}`}
    >
      {n}
    </button>
  )
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">Score</div>
      <div className="grid grid-cols-4 gap-1">
        {[0,2,4,6].map(n => <Btn key={n} n={n} />)}
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {[1,3,5,7].map(n => <Btn key={n} n={n} />)}
      </div>
    </div>
  )
}

function PlayerSelect({ label, firstSet, value, options, onChange, isDark }: {
  label: string,
  firstSet: boolean,
  value: string | null,
  options: SpillerOption[],
  onChange: (v: string | null) => void,
  isDark: boolean,
}) {
  if (firstSet) {
    // Brug react-select for første sæt (søgbar) – med iOS-zoom fix (font >= 16px)
    const styles = {
      control: (base: any) => ({
        ...base,
        borderRadius: 10,
        minHeight: 40,
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#374151' : '#d1d5db',
        boxShadow: 'none',
        fontSize: '16px',
      }),
      singleValue: (base: any) => ({ ...base, color: isDark ? '#ffffff' : '#111827', fontSize: '16px' }),
      input: (base: any) => ({ ...base, color: isDark ? '#ffffff' : '#111827', fontSize: '16px' }),
      placeholder: (base: any) => ({ ...base, color: isDark ? '#9ca3af' : '#6b7280', fontSize: '16px' }),
      menu: (base: any) => ({ ...base, backgroundColor: isDark ? '#111827' : '#ffffff', color: isDark ? '#ffffff' : '#111827', fontSize: '16px' }),
      option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isFocused ? (isDark ? '#1f2937' : '#f3f4f6') : 'transparent',
        color: isDark ? '#ffffff' : '#111827',
        fontSize: '16px',
      }),
    }

    return (
      <div className="mb-1.5">
        <label className="block text-xs mb-1">{label}</label>
        <Select
          placeholder="Vælg spiller…"
          options={options}
          value={value ? { value, label: options.find(o => o.value===value)?.label || value } : null}
          onChange={(opt) => onChange(opt ? (opt as SpillerOption).value : null)}
          isClearable
          styles={styles as any}
        />
      </div>
    )
  }
  return (
    <div className="mb-1.5">
      <label className="block text-xs mb-1">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full h-10 rounded-lg border px-2.5 py-1.5 text-[16px] bg-white/80 dark:bg-zinc-800"
      >
        <option value="">Vælg spiller…</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
