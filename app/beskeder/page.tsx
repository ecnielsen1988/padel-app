// app/beskeder/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Message, sendDirectMessage } from '@/lib/messages';
import NotificationsCard from '@/app/components/NotificationsCard';

type Thread = {
  counterpartId: string;
  counterpartName: string;
  lastMessage: Message;
  unread: number;
};

type ProfileNameRow = { visningsnavn: string | null };

export default function BeskederThreadView() {
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => { setVisible(document.visibilityState === 'visible'); setDesktop(media.matches); };
    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => { media.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [allNames, setAllNames] = useState<string[]>([]);

  // UI state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [threadDrafts, setThreadDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  // Mobile: vis liste eller tråd
  const [view, setView] = useState<'list' | 'thread'>('list');

  // Indlæs bruger, profiler og beskeder
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (!cancelled) {
          setMeId(null);
          setMessages([]);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setMeId(user.id);

      // Navneliste til ny besked
      const { data: names } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .neq('id', user.id)
        .order('visningsnavn', { ascending: true });

      if (!cancelled) {
        setAllNames(
          ((names as ProfileNameRow[] | null) ?? [])
            .map((n) => n?.visningsnavn ?? '')
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        );
      }

      // Hent alle mine beskeder (ind/ud) nyeste først
      const { data: msgs, error: loadError } = await supabase
        .from('beskeder')
        .select('*')
        .or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(500);

      if (!cancelled) {
        if (loadError) setError('Kunne ikke hente beskeder. Genindlæs siden for at prøve igen.');
        const list = (msgs ?? []) as Message[];
        setMessages(list);
        setHasOlder(list.length === 500);
        setLoading(false);

        // Forvalgt tråd: seneste beskeds modpart
        const requested = new URLSearchParams(window.location.search).get('with');
        if (requested && list.some((m) => m.sender_id === requested || m.recipient_id === requested)) {
          setSelectedThreadId(requested);
          setView('thread');
        } else if (list.length > 0) {
          const m = list[0];
          const counterpartId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
          setSelectedThreadId(counterpartId);
        }
      }
    })().catch(() => {
      if (!cancelled) { setError('Kunne ikke hente beskeder. Genindlæs siden for at prøve igen.'); setLoading(false); }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setMeId(null); setMessages([]); setSelectedThreadId(null);
        setComposerBody(''); setRecipientName(''); setThreadDrafts({});
      } else if (meId && session?.user && session.user.id !== meId) {
        window.location.reload();
      }
    });
    return () => subscription.unsubscribe();
  }, [meId]);

  // Realtime (kun mine rækker) + deduplikering
  useEffect(() => {
    if (!meId) return;

    let cancelled = false;
    let refreshing = false;
    async function refresh() {
      if (refreshing || document.visibilityState !== 'visible') return;
      refreshing = true;
      try {
        const { data, error } = await supabase.from('beskeder').select('*')
          .or(`recipient_id.eq.${meId},sender_id.eq.${meId}`).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500);
        if (cancelled || error || !data) return;
        const latest = data as Message[];
        setMessages((prev) => {
          const ids = new Set(latest.map((m) => m.id));
          const boundary = latest.length === 500 ? latest[latest.length - 1].created_at : null;
          const older = boundary ? prev.filter((m) => !ids.has(m.id) && m.created_at <= boundary) : [];
          return [...latest, ...older];
        });
      } finally { refreshing = false; }
    }
    const refreshVisible = () => { void refresh().catch(() => {}); };
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);

    const addIfNewAtTop = (m: Message) =>
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));

    const channel = supabase
      .channel('beskeder-threads')
      // Kun inserts hvor jeg er modtager
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beskeder', filter: `recipient_id=eq.${meId}` },
        (payload) => addIfNewAtTop(payload.new as Message)
      )
      // Kun inserts hvor jeg er afsender
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beskeder', filter: `sender_id=eq.${meId}` },
        (payload) => addIfNewAtTop(payload.new as Message)
      )
      // Markering som læst (kun indgående)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beskeder', filter: `recipient_id=eq.${meId}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beskeder', filter: `sender_id=eq.${meId}` },
        (payload) => setMessages((prev) => prev.map((m) => m.id === payload.new.id ? payload.new as Message : m)))
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh().catch(() => {}); });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
      supabase.removeChannel(channel);
    };
  }, [meId]);

  // Afledte: tråde
  const threads = useMemo<Thread[]>(() => {
    if (!meId) return [];
    const map = new Map<string, Thread>();

    for (const m of messages) {
      const counterpartId = m.sender_id === meId ? m.recipient_id : m.sender_id;
      const counterpartName =
        m.sender_id === meId ? m.recipient_visningsnavn : m.sender_visningsnavn;

      const key = counterpartId;
      const existing = map.get(key);

      const isUnreadForMe = m.recipient_id === meId && !m.read_at;

      if (!existing) {
        map.set(key, {
          counterpartId,
          counterpartName,
          lastMessage: m,
          unread: isUnreadForMe ? 1 : 0,
        });
      } else {
        // opdater lastMessage hvis nyere
        if (new Date(m.created_at) > new Date(existing.lastMessage.created_at)) {
          existing.lastMessage = m;
        }
        if (isUnreadForMe) existing.unread += 1;
      }
    }

    // Sortér tråde efter seneste aktivitet (nyeste først)
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
    );
  }, [messages, meId]);

  const selectedThread = threads.find((t) => t.counterpartId === selectedThreadId) || null;

  // Beskeder for valgt tråd — NYESTE FØRST (descending)
  const selectedMessages = useMemo(() => {
    if (!selectedThreadId) return [];
    return messages
      .filter(
        (m) =>
          (m.sender_id === meId && m.recipient_id === selectedThreadId) ||
          (m.sender_id === selectedThreadId && m.recipient_id === meId)
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [messages, meId, selectedThreadId]);

  // Markér valgt tråd som læst (alle ulæste indgående)
  useEffect(() => {
    if (!meId || !selectedThreadId || !visible || (!desktop && view !== 'thread')) return;
    const idsToMark = selectedMessages
      .filter((m) => m.recipient_id === meId && !m.read_at)
      .map((m) => m.id);
    if (idsToMark.length === 0) return;

    (async () => {
      const now = new Date().toISOString();
      const { error } = await (supabase.from('beskeder') as any)
        .update({ read_at: now } as any)
        .in('id', idsToMark as any).eq('recipient_id', meId).is('read_at', null);
      if (!error) {
        setMessages((prev) => prev.map((m) => (idsToMark.includes(m.id) ? { ...m, read_at: now } : m)));
      } else setError('Kunne ikke markere beskeder som læst.');
    })().catch(() => setError('Kunne ikke markere beskeder som læst.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, meId, selectedMessages, visible, desktop, view]);

  // === Composer helpers ===
  async function sendMessageByName(name: string, body: string): Promise<boolean> {
    const { data: recipient, error } = await supabase.from('profiles')
      .select('id, visningsnavn').eq('visningsnavn', name.trim())
      .maybeSingle<{ id: string; visningsnavn: string | null }>();
    if (error || !recipient?.id) {
      setError('Kunne ikke finde modtageren.');
      return false;
    }
    return sendMessageTo(recipient.id, body, true);
  }

  async function sendMessageTo(recipientId: string, body: string, openThread = false): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      const { message, push } = await sendDirectMessage(recipientId, body.trim());
      setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [message, ...prev]);
      if (openThread) { setSelectedThreadId(recipientId); setView('thread'); }
      if (push.status === 'failed' || push.status === 'unavailable') {
        setNotice('Beskeden er sendt. Telefonnotifikationen kunne ikke sendes.');
      }
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Beskeden blev ikke sendt. Prøv igen.');
      return false;
    }
  }

  async function sendNewMessage() {
    if (sendingRef.current || !recipientName.trim() || !composerBody.trim()) return;
    sendingRef.current = true; setSending(true);
    try {
      if (await sendMessageByName(recipientName, composerBody)) {
        setComposerBody(''); setRecipientName(''); setComposerOpen(false);
      }
    } catch {
      setError('Beskeden blev ikke sendt. Prøv igen.');
    } finally { sendingRef.current = false; setSending(false); }
  }

  // Scroll til top af tråden ved nye beskeder (fordi nyeste ligger øverst)
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    threadScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedThreadId, selectedMessages.length]);

  // Hard delete (afsender altid)
  function canHardDelete(m: Message) {
    return !!meId && m.sender_id === meId;
  }
  async function hardDeleteEverywhere(m: Message) {
    if (!canHardDelete(m)) return;
    const ok = confirm('Slet denne besked for begge parter? Dette kan ikke fortrydes.');
    if (!ok) return;
    const { error } = await (supabase.from('beskeder') as any).delete().eq('id', m.id);
    if (error) {
      console.error(error);
      alert('Kunne ikke slette beskeden.');
      return;
    }
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function loadOlder() {
    if (!meId || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const oldest = [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at) || String(b.id).localeCompare(String(a.id), 'en', { numeric: true })).at(-1)!;
      const cursor = `or(created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id}))`;
      const { data, error } = await supabase.from('beskeder').select('*')
        .or(`and(recipient_id.eq.${meId},${cursor}),and(sender_id.eq.${meId},${cursor})`)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500);
      if (error) throw error;
      const rows = (data ?? []) as Message[];
      setMessages((prev) => [...prev, ...rows.filter((m) => !prev.some((p) => p.id === m.id))]);
      setHasOlder(rows.length === 500);
    } catch { setError('Kunne ikke hente ældre beskeder. Prøv igen.'); }
    finally { setLoadingOlder(false); }
  }

  // UI: Loading / Login
  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-lg">⏳ Indlæser beskeder…</p>
      </div>
    );
  }
  if (!meId) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Du er ikke logget ind</h1>
        <Link
          href="/login"
          className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-6 rounded-xl shadow"
        >
          Log ind
        </Link>
      </div>
    );
  }

  // Render
  return (
    <main className="min-h-screen py-6 sm:py-8 px-4 sm:px-6 md:px-10 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <NotificationsCard />
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-900">{notice}</p>}
      </div>
      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4 md:gap-6">
        {/* Thread list */}
        <section className={`${view === 'thread' ? 'hidden md:block' : ''}`}>
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-pink-600">💬 Samtaler</h1>
            <button
              onClick={() => setComposerOpen((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-black font-semibold shadow"
            >
              ✍️ Ny
            </button>
          </div>

          {composerOpen && (
            <div className="mb-3 rounded-2xl p-3 bg-white dark:bg-[#2a2a2a] shadow">
              <div className="space-y-2">
                <div>
                  <label htmlFor="message-recipient" className="block text-sm mb-1">Modtager (visningsnavn)</label>
                  <input
                    id="message-recipient"
                    list="alle-spillere"
                    disabled={sending}
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Skriv eller vælg…"
                  />
                  <datalist id="alle-spillere">
                    {allNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="new-message-body" className="block text-sm mb-1">Besked</label>
                  <textarea
                    id="new-message-body"
                    disabled={sending}
                    value={composerBody}
                    onChange={(e) => setComposerBody(e.target.value)}
                    placeholder="Hej! Skal vi tage en kamp? 😊  (Shift+Enter = linjeskift, Enter = send)"
                    rows={3}
                    className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
                    maxLength={5000}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault(); void sendNewMessage();
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setComposerOpen(false)}
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700"
                  >
                    Luk
                  </button>
                  <button
                    onClick={sendNewMessage}
                    disabled={sending || !recipientName.trim() || !composerBody.trim()}
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60"
                  >
                    {sending ? 'Sender…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {threads.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">Ingen samtaler endnu.</p>
          ) : (
            <ul className="space-y-2">
              {threads.map((t) => {
                const active = t.counterpartId === selectedThreadId;
                return (
                  <li key={t.counterpartId}>
                    <button
                      onClick={() => {
                        setSelectedThreadId(t.counterpartId);
                        setView('thread');
                      }}
                      className={`w-full text-left rounded-2xl p-3 shadow transition ${
                        active
                          ? 'bg-pink-100 dark:bg-pink-900/30'
                          : 'bg-white dark:bg-[#2a2a2a] hover:bg-gray-50 dark:hover:bg-[#333]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate">{t.counterpartName}</span>
                            {t.unread > 0 && (
                              <span className="text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">
                                {t.unread}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                            {t.lastMessage.body}
                          </p>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                          {new Date(t.lastMessage.created_at).toLocaleString('da-DK')}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Thread panel */}
        <section className={`${view === 'list' ? 'hidden md:block' : ''}`}>
          {!selectedThread ? (
            <div className="h-full rounded-2xl p-6 bg-white dark:bg-[#2a2a2a] shadow flex items-center justify-center text-gray-500">
              Vælg en samtale i listen
            </div>
          ) : (
            <div className="h-[75dvh] max-h-[760px] min-h-[360px] rounded-2xl bg-white dark:bg-[#2a2a2a] shadow flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Tilbage til samtaler"
                    className="md:hidden px-2 py-1 rounded border border-gray-300 dark:border-gray-700"
                    onClick={() => setView('list')}
                  >
                    ←
                  </button>
                  <h2 className="font-semibold">
                    Samtale med <span className="text-pink-600">{selectedThread.counterpartName}</span>
                  </h2>
                </div>
              </div>

              {/* Messages (NYESTE ØVERST) */}
              <div
                ref={threadScrollRef}
                className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2"
              >
                {selectedMessages.map((m) => {
                  const mine = m.sender_id === meId;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 shadow ${
                          mine
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-100 dark:bg-[#3a3a3a] text-gray-900 dark:text-white'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                        <div
                          className={`mt-1 text-[11px] opacity-80 ${
                            mine ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {new Date(m.created_at).toLocaleString('da-DK')}
                          {m.sender_id !== meId && !m.read_at ? ' · Ulæst' : ''}
                        </div>
                      </div>
                      {mine && (
                        <button
                          title="Slet besked for alle"
                          aria-label="Slet besked"
                          onClick={() => hardDeleteEverywhere(m)}
                          className="ml-1 self-center p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Composer (multilinje) */}
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <ThreadComposer
                  key={selectedThread.counterpartId}
                  text={threadDrafts[selectedThread.counterpartId] ?? ''}
                  onTextChange={(text) => setThreadDrafts((prev) => ({ ...prev, [selectedThread.counterpartId]: text }))}
                  onSend={async (text) =>
                    sendMessageTo(
                      selectedThread.counterpartId,
                      text
                    )
                  }
                />
              </div>
            </div>
          )}
        </section>
        {hasOlder && <button onClick={loadOlder} disabled={loadingOlder} className="rounded-xl border p-2 text-sm md:col-span-2">{loadingOlder ? 'Henter…' : 'Hent ældre beskeder'}</button>}
      </div>
    </main>
  );
}

function ThreadComposer({ onSend, text, onTextChange }: { onSend: (text: string) => Promise<boolean>; text: string; onTextChange: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function handleSend() {
    const msg = text.trim();
    if (!msg || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      if (await onSend(msg)) onTextChange('');
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <textarea
          aria-label="Svar i samtalen"
          disabled={busy}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Skriv en besked…  (Shift+Enter = linjeskift, Enter = send)"
          rows={1}
          className="w-full resize-y rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
          maxLength={5000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault(); void handleSend();
            }
          }}
        />
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          Enter: send &nbsp;•&nbsp; Shift+Enter: linjeskift
        </p>
      </div>
      <button
        onClick={handleSend}
        disabled={busy || !text.trim()}
        className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60"
      >
        {busy ? 'Sender…' : 'Send'}
      </button>
    </div>
  );
}

