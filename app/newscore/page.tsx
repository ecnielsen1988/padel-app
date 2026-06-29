'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Select from 'react-select'
import { PageShell } from '../components/ui'
import { supabase } from '@/lib/supabaseClient'

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

const VALID_FINISHES = new Set([
  '6-0', '6-1', '6-2', '6-3', '6-4', '7-5', '7-6',
  '0-6', '1-6', '2-6', '3-6', '4-6', '5-7', '6-7',
])

function isFinished(a: number, b: number) {
  return VALID_FINISHES.has(`${a}-${b}`)
}

function emptySet(today = new Date()): SaetState {
  return {
    date: today.toISOString().split('T')[0],
    holdA1: null,
    holdA2: null,
    holdB1: null,
    holdB2: null,
    scoreA: 0,
    scoreB: 0,
  }
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default function NewScorePage() {
  const [spillere, setSpillere] = useState<SpillerOption[]>([])
  const [aktivtSaet, setAktivtSaet] = useState<SaetState>(emptySet())
  const [afsluttedeSaet, setAfsluttedeSaet] = useState<SaetState[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [visningsnavn, setVisningsnavn] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('visningsnavn, status')
        .in('status', ['active', 'sleep'])
        .not('visningsnavn', 'is', null)
        .order('visningsnavn', { ascending: true })

      if (!error) {
        const seen = new Set<string>()
        const options = (data || [])
          .map((spiller: any) => (spiller?.visningsnavn ?? '').toString().trim())
          .filter((value) => value.length > 0 && !seen.has(value) && (seen.add(value), true))
          .map((value) => ({ value, label: value }))

        setSpillere(options)
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle()

      const navn =
        typeof profile?.visningsnavn === 'string' && profile.visningsnavn
          ? profile.visningsnavn
          : user.email || 'Spiller'

      setVisningsnavn(navn)
    })()
  }, [])

  const restrictedOptions = useMemo(() => {
    if (afsluttedeSaet.length === 0) return null
    const first = afsluttedeSaet[0]
    const ids = [first.holdA1, first.holdA2, first.holdB1, first.holdB2].filter(Boolean) as string[]
    return spillere.filter((option) => ids.includes(option.value))
  }, [afsluttedeSaet, spillere])

  const scoreLabel = `${aktivtSaet.scoreA}-${aktivtSaet.scoreB}`
  const scoreIsFinished = isFinished(aktivtSaet.scoreA, aktivtSaet.scoreB)

  const allPlayersSelected = (s: SaetState) => !!(s.holdA1 && s.holdA2 && s.holdB1 && s.holdB2)
  const canAddSet = allPlayersSelected(aktivtSaet)
  const canSubmit = () => {
    const all = [...afsluttedeSaet, aktivtSaet]
    const rows = all.filter((s) => !(s.scoreA === 0 && s.scoreB === 0))
    return rows.length > 0 && rows.every((s) => allPlayersSelected(s) && s.date)
  }

  function updateField<K extends keyof SaetState>(field: K, value: SaetState[K]) {
    setAktivtSaet((prev) => ({ ...prev, [field]: value }))
  }

  function setPlayer(field: 'holdA1' | 'holdA2' | 'holdB1' | 'holdB2', newVal: string | null) {
    setAktivtSaet((prev) => {
      const oldVal = prev[field]
      const next: SaetState = { ...prev, [field]: newVal }
      if (!newVal || !oldVal || newVal === oldVal) return next

      const otherFields: Array<keyof SaetState> = ['holdA1', 'holdA2', 'holdB1', 'holdB2']
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
    setAfsluttedeSaet((prev) => [...prev, aktivtSaet])
    setAktivtSaet((prev) => ({ ...prev, scoreA: 0, scoreB: 0 }))
  }

  function removeSet(index: number) {
    setAfsluttedeSaet((prev) => prev.filter((_, idx) => idx !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit()) return

    setBusy(true)
    setMessage('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setBusy(false)
      setMessage('❌ Du skal være logget ind.')
      return
    }

    const { data: profil, error: profilError } = await supabase
      .from('profiles')
      .select('visningsnavn')
      .eq('id', user.id)
      .maybeSingle<ProfileNameRow>()

    if (profilError || !profil?.visningsnavn) {
      setBusy(false)
      setMessage('❌ Kunne ikke finde visningsnavn.')
      return
    }

    const indberetter = (profil.visningsnavn ?? '').toString().trim()

    const { data: maxData, error: maxError } = await supabase
      .from('newresults')
      .select('kampid')
      .not('kampid', 'is', null)
      .order('kampid', { ascending: false })
      .limit(1)

    if (maxError) {
      setBusy(false)
      setMessage(`❌ Fejl ved hentning af kampid: ${maxError.message}`)
      return
    }

    const lastKampid = Number(((maxData as { kampid: number | null }[] | null)?.[0]?.kampid) ?? 0)
    const nyKampid = (Number.isFinite(lastKampid) ? lastKampid : 0) + 1

    const all = [...afsluttedeSaet, aktivtSaet]
    const rows = all
      .filter((s) => !(s.scoreA === 0 && s.scoreB === 0))
      .map((s) => ({
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
        indberettet_af: indberetter,
      }))

    const { error } = await (supabase.from('newresults') as any).insert(rows as any)

    if (error) {
      setMessage(`❌ Fejl: ${error.message}`)
      setBusy(false)
      return
    }

    const spillereISubmit = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.holdA1, row.holdA2, row.holdB1, row.holdB2])
          .filter(Boolean)
          .map((navn) => String(navn).trim())
      )
    )

    if (spillereISubmit.length > 0) {
      const { error: statusError } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .in('visningsnavn', spillereISubmit)
        .neq('status', 'inactive')

      if (statusError) {
        console.error('Kunne ikke sætte spillere til active:', statusError)
      }
    }

    setMessage(`✅ Resultater indsendt! 🏆 Kamp ID: ${nyKampid}`)
    setAfsluttedeSaet([])
    setAktivtSaet(emptySet())
    setBusy(false)
  }

  function nameFor(val: string | null) {
    if (!val) return 'Ikke valgt'
    return spillere.find((spiller) => spiller.value === val)?.label || val
  }

  const currentTime = new Intl.DateTimeFormat('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-4 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.history.back()
              }}
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25"
            >
              ← Tilbage
            </button>
            <span>{currentTime}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Indrapportering
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Indtast resultater
              </h1>
            </div>

            <Link
              href={visningsnavn ? `/profil/${encodeURIComponent(visningsnavn)}` : '/startside'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(visningsnavn || 'Spiller')}
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-[16px] bg-white/14 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Aktiv kamp
              </p>
              <p className="mt-1 text-xl font-black">
                #{afsluttedeSaet.length + 1}
              </p>
            </div>
            <div className="rounded-[16px] bg-white/14 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Valgt score
              </p>
              <p className="mt-1 text-xl font-black">{scoreLabel}</p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-3">
            {afsluttedeSaet.length > 0 ? (
              <section className="rounded-[20px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                    Tilføjede sæt
                  </h2>
                  <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]">
                    {afsluttedeSaet.length} sæt
                  </span>
                </div>

                <div className="space-y-2">
                  {afsluttedeSaet.map((saet, index) => (
                    <div
                      key={`${saet.date}-${index}`}
                      className="rounded-[16px] border border-[#ececf1] bg-[#fbfbfc] p-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8a8f9c]">
                            Sæt {index + 1}
                          </p>
                          <p className="mt-1 text-[13px] font-semibold text-[#1f2430]">
                            {nameFor(saet.holdA1)} / {nameFor(saet.holdA2)}
                          </p>
                          <p className="text-[13px] font-semibold text-[#1f2430]">
                            {nameFor(saet.holdB1)} / {nameFor(saet.holdB2)}
                          </p>
                          <p className="mt-1 text-xs text-[#8a8f9c]">{saet.date}</p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-base font-black text-[#f01f78]">
                            {saet.scoreA}-{saet.scoreB}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeSet(index)}
                            className="mt-2 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#c62828] shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                          >
                            Fjern
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

              <section className="rounded-[20px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                      Sæt #{afsluttedeSaet.length + 1}
                  </h2>
                  <p className="mt-1 text-sm text-[#6d7280]">
                    Vælg de fire spillere og sæt derefter scoren.
                  </p>
                </div>
                <input
                  type="date"
                  className="rounded-xl border border-[#e6e7eb] bg-[#fbfbfc] px-3 py-1.5 text-sm text-[#1f2430]"
                  value={aktivtSaet.date}
                  onChange={(e) => updateField('date', e.target.value)}
                />
              </div>

              <div className="grid gap-2.5">
                <TeamCard
                  title="Hold A"
                  accent="rose"
                  firstSet={afsluttedeSaet.length === 0}
                  options={afsluttedeSaet.length === 0 ? spillere : (restrictedOptions || [])}
                  player1Label="Spiller A1"
                  player2Label="Spiller A2"
                  player1Value={aktivtSaet.holdA1}
                  player2Value={aktivtSaet.holdA2}
                  onPlayer1Change={(value) => setPlayer('holdA1', value)}
                  onPlayer2Change={(value) => setPlayer('holdA2', value)}
                  score={aktivtSaet.scoreA}
                  onPickScore={(value) => updateField('scoreA', value)}
                />

                <TeamCard
                  title="Hold B"
                  accent="gold"
                  firstSet={afsluttedeSaet.length === 0}
                  options={afsluttedeSaet.length === 0 ? spillere : (restrictedOptions || [])}
                  player1Label="Spiller B1"
                  player2Label="Spiller B2"
                  player1Value={aktivtSaet.holdB1}
                  player2Value={aktivtSaet.holdB2}
                  onPlayer1Change={(value) => setPlayer('holdB1', value)}
                  onPlayer2Change={(value) => setPlayer('holdB2', value)}
                  score={aktivtSaet.scoreB}
                  onPickScore={(value) => updateField('scoreB', value)}
                />
              </div>
            </section>

            <section className="rounded-[20px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                    Kampstatus
                  </h2>
                  <p className="mt-1 text-sm text-[#6d7280]">
                    {scoreIsFinished
                      ? 'Scoren tæller som et færdigspillet sæt.'
                      : 'Scoren gemmes stadig, men sættet markeres ikke som færdigspillet.'}
                  </p>
                </div>
                <span
                  className={[
                    'rounded-full px-3 py-1 text-[11px] font-bold',
                    scoreIsFinished
                      ? 'bg-[#ecf8f2] text-[#1f7a5a]'
                      : 'bg-[#fff4e5] text-[#b06a00]',
                  ].join(' ')}
                >
                  {scoreIsFinished ? 'Færdigt sæt' : 'Ikke færdigt'}
                </span>
              </div>
            </section>

            {message ? (
              <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                <p
                  className={
                    message.startsWith('❌')
                      ? 'text-sm font-semibold text-red-600'
                      : 'text-sm font-semibold text-[#f01f78]'
                  }
                >
                  {message}
                </p>
                {message.startsWith('✅') ? (
                  <div className="mt-2 flex gap-2 text-xs text-[#6d7280]">
                    <Link href="/mine" className="font-semibold text-[#f01f78]">
                      Se mine resultater
                    </Link>
                    <span>·</span>
                    <Link href="/lastgames" className="font-semibold text-[#f01f78]">
                      Se seneste
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="sticky bottom-3 mt-3 md:static">
            <div className="rounded-[20px] bg-white p-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canAddSet}
                  onClick={addSet}
                  className="flex-1 rounded-[14px] bg-[#f01f78] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"
                >
                  Tilføj sæt
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit() || busy}
                  className="flex-1 rounded-[14px] bg-[#1f7a5a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"
                >
                  {busy ? 'Indsender…' : 'Indsend resultater'}
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-[#8a8f9c]">
                Tilføj flere sæt før du indsender, hvis hele kampen skal samles under samme kamp-ID.
              </p>
            </div>
          </div>
        </form>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            {
              href: visningsnavn ? `/profil/${encodeURIComponent(visningsnavn)}` : '/startside',
              icon: '🧑‍🎾',
              label: 'Profil',
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-16 flex-col items-center gap-1 text-[#7b8190]"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </PageShell>
  )
}

function TeamCard({
  title,
  accent,
  firstSet,
  options,
  player1Label,
  player2Label,
  player1Value,
  player2Value,
  onPlayer1Change,
  onPlayer2Change,
  score,
  onPickScore,
}: {
  title: string
  accent: 'rose' | 'gold'
  firstSet: boolean
  options: SpillerOption[]
  player1Label: string
  player2Label: string
  player1Value: string | null
  player2Value: string | null
  onPlayer1Change: (value: string | null) => void
  onPlayer2Change: (value: string | null) => void
  score: number
  onPickScore: (value: number) => void
}) {
  const accentClasses =
    accent === 'rose'
      ? 'bg-[#fff0f5] border-[#f7a9c8]'
      : 'bg-[#fff8e8] border-[#ffd98a]'

  return (
    <div className={`rounded-[18px] border p-2.5 ${accentClasses}`}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-[#1f2430]">{title}</h3>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#6d7280]">
          Score {score}
        </span>
      </div>

      <PlayerSelect
        label={player1Label}
        firstSet={firstSet}
        value={player1Value}
        options={options}
        onChange={onPlayer1Change}
      />
      <PlayerSelect
        label={player2Label}
        firstSet={firstSet}
        value={player2Value}
        options={options}
        onChange={onPlayer2Change}
      />

      <ScoreGrid value={score} onPick={onPickScore} />
    </div>
  )
}

function ScoreGrid({
  value,
  onPick,
}: {
  value: number
  onPick: (n: number) => void
}) {
  const Button = ({ n }: { n: number }) => (
    <button
      type="button"
      onClick={() => onPick(n)}
      className={[
        'h-10 rounded-[14px] border text-sm font-bold transition',
        value === n
          ? 'border-[#f01f78] bg-[#f01f78] text-white'
          : 'border-[#e6e7eb] bg-white text-[#2d3340]',
      ].join(' ')}
    >
      {n}
    </button>
  )

  return (
    <div className="mt-2.5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a8f9c]">
        Vælg score
      </p>
      <div className="grid grid-cols-4 gap-2">
        {[0, 2, 4, 6].map((n) => (
          <Button key={n} n={n} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[1, 3, 5, 7].map((n) => (
          <Button key={n} n={n} />
        ))}
      </div>
    </div>
  )
}

function PlayerSelect({
  label,
  firstSet,
  value,
  options,
  onChange,
}: {
  label: string
  firstSet: boolean
  value: string | null
  options: SpillerOption[]
  onChange: (v: string | null) => void
}) {
  if (firstSet) {
    const styles = {
      control: (base: any) => ({
        ...base,
        borderRadius: 14,
        minHeight: 40,
        backgroundColor: '#ffffff',
        borderColor: '#e6e7eb',
        boxShadow: 'none',
        fontSize: '16px',
      }),
      singleValue: (base: any) => ({ ...base, color: '#1f2430', fontSize: '16px' }),
      input: (base: any) => ({ ...base, color: '#1f2430', fontSize: '16px' }),
      placeholder: (base: any) => ({ ...base, color: '#8a8f9c', fontSize: '16px' }),
      menu: (base: any) => ({ ...base, backgroundColor: '#ffffff', color: '#1f2430', fontSize: '16px' }),
      option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isFocused ? '#f7f7fa' : '#ffffff',
        color: '#1f2430',
        fontSize: '16px',
      }),
    }

    return (
      <div className="mb-2">
        <label className="mb-1 block text-xs font-bold uppercase tracking-[0.1em] text-[#6d7280]">
          {label}
        </label>
        <Select
          placeholder="Vælg spiller…"
          options={options}
          value={value ? { value, label: options.find((option) => option.value === value)?.label || value } : null}
          onChange={(opt) => onChange(opt ? (opt as SpillerOption).value : null)}
          isClearable
          styles={styles as any}
        />
      </div>
    )
  }

  return (
      <div className="mb-2">
      <label className="mb-1 block text-xs font-bold uppercase tracking-[0.1em] text-[#6d7280]">
        {label}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 w-full rounded-[14px] border border-[#e6e7eb] bg-white px-3 py-2 text-[16px] text-[#1f2430]"
      >
        <option value="">Vælg spiller…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
