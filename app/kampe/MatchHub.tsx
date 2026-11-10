'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Select from 'react-select';
import { MessageTimeline, ReplyComposer } from '../beskeder/InboxView';
import { supabase } from '@/lib/supabaseClient';
import { danishNow, matchDate, matchRequest, MatchRequestError, type MatchDetails, type MatchSet, type PlayerMatch } from '@/lib/playerMatches';

type Player = { id: string; name: string };
type Mode = 'overview' | 'edit' | 'result';
const panel = 'rounded-2xl border border-[#e9dfe9] bg-white p-4 sm:p-6 dark:border-white/10 dark:bg-[#201e31]';
const input = 'mt-1.5 w-full rounded-xl border border-[#dfd5e1] bg-white px-3 py-2.5 text-base dark:border-white/20 dark:bg-[#29263c]';
const primary = 'inline-flex items-center justify-center rounded-xl bg-[#bc135d] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#a30e4e] disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center rounded-xl border border-[#e9dfe9] px-4 py-2.5 text-sm font-bold hover:bg-pink-50 dark:border-white/20 dark:hover:bg-white/10';
const emptySet = (): MatchSet => ({ a: 0, b: 0, partner: 2 });

export default function MatchHub({ matchId }: { matchId?: string }) {
  const router = useRouter();
  const [matches, setMatches] = useState<PlayerMatch[]>([]);
  const [meId, setMeId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [slots, setSlots] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode>('overview');
  const [creating, setCreating] = useState(false);
  const [details, setDetails] = useState<MatchDetails>(() => ({ ...danishNow(), location: '', court: '' }));
  const [revision, setRevision] = useState(1);
  const [sets, setSets] = useState<MatchSet[]>([emptySet()]);
  const [reply, setReply] = useState('');
  const [showChat, setShowChat] = useState(false);
  const lastRead = useRef('');
  const currentRequest = useRef(0);
  const showLogin = useRef(false);
  const actionPanel = useRef<HTMLFormElement>(null);

  const refresh = useCallback(async () => {
    const request = ++currentRequest.current;
    try {
      const result = await matchRequest<{ matches: PlayerMatch[]; meId: string }>(matchId ? `?id=${matchId}` : '');
      if (request !== currentRequest.current) return;
      setMatches(result.matches);
      setMeId(result.meId);
      setLoadError('');
      showLogin.current = false;
    } catch (error) {
      if (request !== currentRequest.current) return;
      showLogin.current = error instanceof MatchRequestError && error.status === 401;
      if (showLogin.current) { setMatches([]); setMeId(''); }
      throw error;
    }
  }, [matchId]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { await refresh(); }
      catch (error) { if (alive) setLoadError((error as Error).message); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    const refreshVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refreshVisible, 12000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { alive = false; currentRequest.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [refresh]);

  useEffect(() => {
    const updateHash = () => setShowChat(window.location.hash === '#samtale');
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

  useEffect(() => {
    if (matchId || !meId) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.from('profiles').select('id,visningsnavn')
        .in('status', ['active', 'sleep']).not('visningsnavn', 'is', null).order('visningsnavn');
      if (!alive) return;
      if (error) { setError('Kunne ikke hente spillerlisten.'); return; }
      setPlayers(((data ?? []) as { id: string; visningsnavn: string }[]).map(p => ({ id: p.id, name: p.visningsnavn })));
      setSlots(prev => prev.some(Boolean) ? prev : [meId, '', '', '']);
    })();
    return () => { alive = false; };
  }, [meId, matchId]);

  const match = matchId ? matches[0] : undefined;
  const last = match?.last_message?.created_at;
  const visibleMatchId = match?.id;
  useEffect(() => {
    if (showChat && visibleMatchId && window.location.hash === '#samtale') {
      document.getElementById('samtale')?.scrollIntoView({ block: 'start' });
    }
  }, [visibleMatchId, showChat]);
  useEffect(() => {
    if (mode !== 'overview') actionPanel.current?.scrollIntoView({ block: 'start' });
  }, [mode]);
  useEffect(() => {
    if (!showChat || !matchId || !last || !match?.unread) return;
    const markRead = () => {
      if (document.visibilityState !== 'visible' || lastRead.current === last) return;
      lastRead.current = last;
      void matchRequest('', { action: 'read', id: matchId, through: last }).catch(() => { lastRead.current = ''; });
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [matchId, last, match?.unread, showChat]);

  function change(field: keyof MatchDetails, value: string) {
    setDetails(prev => ({ ...prev, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      if (!matchId) {
        const result = await matchRequest<{ id: string }>('', { action: 'create', players: slots, ...details });
        router.push(`/kampe/${result.id}`);
        return;
      }
      await matchRequest('', mode === 'result'
        ? { action: 'result', id: matchId, revision, sets: sets.filter(s => s.a || s.b) }
        : { action: 'update', id: matchId, revision, ...details });
      setMode('overview');
      await refresh().catch(() => setLoadError('Gemningen lykkedes, men den nye aftale kunne ikke hentes endnu.'));
    } catch (error) {
      setError((error as Error).message);
      void refresh().catch(() => {});
    } finally { saving.current = false; setBusy(false); }
  }

  async function send(text: string) {
    if (!matchId) return false;
    setError('');
    try {
      await matchRequest('', { action: 'message', id: matchId, body: text });
      await refresh().catch(() => {});
      return true;
    } catch (error) { setError((error as Error).message); return false; }
  }

  const now = danishNow();
  const matchStarted = match ? `${match.date}T${match.start_time.slice(0,5)}` <= `${now.date}T${now.time}` : false;

  return <main className="min-h-screen bg-[#f5f3f8] p-4 pb-12 text-[#262337] dark:bg-[#161524] dark:text-[#f6f3fa] sm:p-8">
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <Link href={matchId ? '/kampe' : '/startside'} className="text-sm font-bold text-[#a30e4e] dark:text-pink-300">← {matchId ? 'Mine kampe' : 'Forside'}</Link>
        <Link href="/beskeder" className="text-sm font-bold text-[#a30e4e] dark:text-pink-300">Beskeder</Link>
      </header>
      <h1 className="text-3xl font-black tracking-tight">{matchId ? 'Kampaftale' : 'Mine kampe'}</h1>
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError} {showLogin.current && <Link className="underline" href="/login">Log ind</Link>}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p>Henter kampe…</p> : !matchId ? <>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setError(''); setCreating(!creating); }} className={primary} disabled={!meId}>{creating ? 'Luk oprettelse' : '+ Opret kamp'}</button>
          <Link className={secondary} href="/newscore">Indberet en spillet kamp uden aftale</Link>
        </div>
        {creating && <form onSubmit={save} className={panel + ' space-y-4'}>
          <h2 className="text-xl font-extrabold">Opret kamp</h2>
          <p className="text-sm opacity-75">Vælg fire spillere. De får en fælles tråd med kampaftalen.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {slots.map((id, index) => {
              const options = players.filter(p => !slots.includes(p.id) || p.id === id).map(p => ({ value: p.id, label: p.name }));
              const selected = options.find(option => option.value === id) ?? null;
              return <div key={index}>
                <label className="text-sm font-bold" htmlFor={`match-player-${index}`}>Hold {index < 2 ? 'A' : 'B'} · Spiller {index % 2 + 1}</label>
                <Select className="mt-1.5 text-[#262337]" inputId={`match-player-${index}`} instanceId={`match-player-${index}`} placeholder="Søg efter spiller"
                  noOptionsMessage={() => 'Ingen spillere fundet'} options={options} value={selected} isDisabled={busy}
                  onChange={option => setSlots(prev => prev.map((p, i) => i === index ? option?.value ?? '' : p))} />
              </div>;
            })}
          </div>
          <DetailsFields value={details} change={change} disabled={busy} />
          <button type="submit" className={primary} disabled={busy || slots.some(slot => !slot) || !slots.includes(meId)}>{busy ? 'Opretter…' : 'Opret kamp og tråd'}</button>
        </form>}
        {matches.length === 0 && !loadError && <p className={panel}>Du har ingen kampaftaler endnu.</p>}
        {matches.map(item => <Link href={`/kampe/${item.id}`} className={panel + ' block hover:border-pink-400'} key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">{matchDate(item.date)} kl. {item.start_time.slice(0, 5)}</h2>
            <span className="rounded-full bg-[#f7e3ee] px-2.5 py-1 text-xs font-bold text-[#96245b]">{item.result_kampid ? 'Indberettet' : item.unread ? `${item.unread} ulæste` : 'Aftalt'}</span>
          </div>
          <p className="mt-1 text-sm">{item.location} · Bane {item.court}</p>
          <p className="mt-2 text-sm opacity-75">{item.players.map(p => p.name).join(', ')}</p>
        </Link>)}
      </> : match && <>
        <section className={panel + ' space-y-4'}>
          <div>
            <h2 className="text-xl font-extrabold">{matchDate(match.date)} kl. {match.start_time.slice(0,5)}</h2>
            <p>{match.location} · Bane {match.court}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 2].map((start, index) => <div key={start} className="rounded-xl bg-[#f7f3f8] p-3 dark:bg-[#29263c]">
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">Hold {index ? 'B' : 'A'}</p>
              <p className="mt-1 text-sm font-bold">{match.players.slice(start, start + 2).map(p => p.name).join(' & ')}</p>
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <a className={primary} href="#samtale" onClick={() => setShowChat(true)}>💬 Beskeder til alle fire{match.unread && !showChat ? ` (${match.unread})` : ''}</a>
            {!match.result_kampid && <button type="button" className={secondary} onClick={() => {
              setError(''); setRevision(match.revision); setDetails({ date: match.date, time: match.start_time.slice(0,5), location: match.location, court: match.court }); setMode('edit');
            }}>Ændr aftale</button>}
            {!match.result_kampid && matchStarted && <button type="button" className={secondary} onClick={() => { setError(''); setRevision(match.revision); setMode('result'); }}>Indtast resultat</button>}
          </div>
          {match.result_kampid ? <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Resultat indberettet · {match.result_sets?.map(s => `${s.a}–${s.b}`).join(', ')}</p>
            : !matchStarted && <p className="text-sm opacity-75">Du kan indberette resultatet efter det aftalte starttidspunkt.</p>}
        </section>
        {mode !== 'overview' && !match.result_kampid && <form ref={actionPanel} className={panel + ' space-y-4'} onSubmit={save}>
          <h2 className="text-lg font-extrabold">{mode === 'edit' ? 'Ændr kampaftalen' : 'Indtast sæt'}</h2>
          {mode === 'edit' ? <DetailsFields value={details} change={change} disabled={busy} /> : <>
            <p className="text-sm opacity-75">De fire spillere er valgt. Du kan vælge makker pr. sæt, hvis I har roteret.</p>
            {sets.map((set, index) => {
              const update = (patch: Partial<MatchSet>) => setSets(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
              return <fieldset key={index} className="space-y-2 rounded-xl border border-[#e9dfe9] p-3 dark:border-white/10">
                <legend className="px-2 text-sm font-bold">Sæt {index + 1}</legend>
                <label className="block text-sm font-bold">Makker til {match.players[0]?.name}
                  <select className={input} value={set.partner} disabled={busy} onChange={e => update({ partner: Number(e.target.value) })}>
                    {match.players.slice(1).map((p, i) => <option key={p.id} value={i + 2}>{p.name}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['a', 'b'] as const).map(side => <label key={side} className="text-sm font-bold">Hold {side.toUpperCase()}
                    <select className={input} value={set[side]} disabled={busy} onChange={e => update({ [side]: Number(e.target.value) })}>
                      {Array.from({length: 8}, (_, value) => <option key={value}>{value}</option>)}
                    </select>
                  </label>)}
                </div>
                {sets.length > 1 && <button className="text-sm font-bold text-[#a30e4e] dark:text-pink-300" type="button" disabled={busy} onClick={() => setSets(prev => prev.filter((_, i) => i !== index))}>Fjern sæt</button>}
              </fieldset>;
            })}
            {sets.length < 12 && <button type="button" className={secondary} disabled={busy} onClick={() => setSets(prev => [...prev, emptySet()])}>+ Tilføj sæt</button>}
          </>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primary} disabled={busy || (mode === 'result' && !sets.some(s => s.a || s.b))}>{busy ? 'Gemmer…' : mode === 'result' ? 'Indberet resultat' : 'Gem aftale'}</button>
            <button type="button" disabled={busy} className={secondary} onClick={() => setMode('overview')}>Annuller</button>
          </div>
        </form>}
        {showChat && <section id="samtale" className="flex h-[min(650px,76dvh)] min-h-80 scroll-mt-4 flex-col overflow-hidden rounded-2xl border border-[#e9dfe9] bg-white dark:border-white/10 dark:bg-[#201e31]">
          <h2 className="shrink-0 border-b border-[#e9dfe9] px-4 py-3 font-extrabold dark:border-white/10">Kamptråd · 4 spillere</h2>
          <MessageTimeline messages={match.messages ?? []} meId={meId} visible senderName={id => match.players.find(player => player.id === id)?.name ?? 'Spiller'} />
          <ReplyComposer text={reply} onChange={setReply} onSend={send} />
        </section>}
      </>}
    </div>
  </main>;
}

function DetailsFields({ value, change, disabled }: { value: MatchDetails; change: (field: keyof MatchDetails, value: string) => void; disabled: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm font-bold">Dato<input className={input} type="date" required disabled={disabled} value={value.date} onChange={e => change('date', e.target.value)} /></label>
    <label className="text-sm font-bold">Tidspunkt<input className={input} type="time" required disabled={disabled} value={value.time} onChange={e => change('time', e.target.value)} /></label>
    <label className="text-sm font-bold">Sted<input className={input} placeholder="Fx Padelhuset Helsinge" required maxLength={100} disabled={disabled} value={value.location} onChange={e => change('location', e.target.value)} /></label>
    <label className="text-sm font-bold">Bane<input className={input} placeholder="Fx 2 eller Center Court" required maxLength={50} disabled={disabled} value={value.court} onChange={e => change('court', e.target.value)} /></label>
  </div>;
}
