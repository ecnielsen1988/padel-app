// app/beskeder/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { notifyUser } from '@/lib/notify';


type Message = {
  id: string;
  sender_id: string;
  sender_visningsnavn: string;
  recipient_id: string;
  recipient_visningsnavn: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Thread = {
  counterpartId: string;
  counterpartName: string;
  lastMessage: Message;
  unread: number;
};

export default function BeskederThreadView() {
  const [meId, setMeId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [allNames, setAllNames] = useState<string[]>([]);

  // UI state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [sending, setSending] = useState(false);

  // Mobile: vis liste eller tråd
  const [view, setView] = useState<'list' | 'thread'>('list');

  // Indlæs bruger, profiler og beskeder
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (mounted) {
          setMeId(null);
          setMeName(null);
          setMessages([]);
          setLoading(false);
        }
        return;
      }

      // Hent visningsnavn fra profiles (fallback til user_metadata)
      const { data: prof } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle();

      const visningsnavn =
        prof?.visningsnavn ??
        ((user.user_metadata as any)?.visningsnavn ?? null);

      if (mounted) {
        setMeId(user.id);
        setMeName(visningsnavn);
      }

      // Navneliste til ny besked
      const { data: names } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .order('visningsnavn', { ascending: true });
      if (mounted) setAllNames((names ?? []).map((n: any) => n.visningsnavn));

      // Hent alle mine beskeder (ind/ud)
      const { data: msgs } = await supabase
        .from('beskeder')
        .select('*')
        .or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (mounted) {
        const list = (msgs ?? []) as Message[];
        setMessages(list);
        setLoading(false);

        // Forvalgt tråd: seneste beskeds modpart
        if (list.length > 0) {
          const m = list[0];
          const counterpartId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
          setSelectedThreadId(counterpartId);
        }
      }
    })();

    // Realtime: INSERT/DELETE/UPDATE(read)
    const channel = supabase
      .channel('beskeder-threads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beskeder' },
        (payload) => {
          const m = payload.new as Message;
          // kun beskeder der involverer mig
          setMessages((prev) => {
            if (!meId) return prev;
            if (m.sender_id !== meId && m.recipient_id !== meId) return prev;
            return [m, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'beskeder' },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((x) => x.id !== deletedId));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beskeder' },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
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

    // Sortér tråde efter seneste aktivitet
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
    );
  }, [messages, meId]);

  const selectedThread = threads.find((t) => t.counterpartId === selectedThreadId) || null;

  // Beskeder for valgt tråd (stigende tid for chat)
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
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [messages, meId, selectedThreadId]);

  // Markér valgt tråd som læst (alle ulæste indgående)
  useEffect(() => {
    if (!meId || !selectedThreadId) return;
    const idsToMark = selectedMessages
      .filter((m) => m.recipient_id === meId && !m.read_at)
      .map((m) => m.id);
    if (idsToMark.length === 0) return;

    (async () => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('beskeder')
        .update({ read_at: now })
        .in('id', idsToMark);
      if (!error) {
        setMessages((prev) =>
          prev.map((m) =>
            idsToMark.includes(m.id) ? { ...m, read_at: now } : m
          )
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, meId, selectedMessages.length]);

  // Skriv ny besked (via navn → lookup)
  async function sendMessageByName(name: string, body: string) {
    if (!meId || !meName) {
      alert('Du skal være logget ind.');
      return;
    }
    const cleanName = name.trim();
    const cleanBody = body.trim();
    if (!cleanName || !cleanBody) return;

    const { data: recipient, error: recErr } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('visningsnavn', cleanName)
      .maybeSingle();
    if (recErr || !recipient) {
      alert('Kunne ikke finde modtageren.');
      return;
    }

    await sendMessageTo(recipient.id, recipient.visningsnavn, cleanBody);
  }

  // Svar i tråd (vi kender id + navn)
  async function sendMessageTo(recipientId: string, recipientName: string, body: string) {
    if (!meId || !meName) return;
    const row = {
      sender_id: meId,
      sender_visningsnavn: meName,
      recipient_id: recipientId,
      recipient_visningsnavn: recipientName,
      body: body.trim(),
    };
    const { data, error } = await supabase
      .from('beskeder')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      console.error(error);
      alert('Kunne ikke sende beskeden.');
      return;
    }
    setMessages((prev) => [...prev, data as Message]); // vi viser i stigende orden i tråden

    // 🚀 Push til modtageren
try {
  await notifyUser({
    user_id: recipientId,
    title: 'Ny besked',
    body: `${meName}: ${row.body}`,
    url: '/beskeder'
  });
} catch (e) {
  console.warn('Kunne ikke sende push (beskeder):', e);
}

  }


  
  // Hard delete (afsender altid)
  function canHardDelete(m: Message) {
    return !!meId && m.sender_id === meId;
  }
  async function hardDeleteEverywhere(m: Message) {
    const ok = confirm('Slet denne besked for begge parter? Dette kan ikke fortrydes.');
    if (!ok) return;
    const { error } = await supabase.from('beskeder').delete().eq('id', m.id);
    if (error) {
      console.error(error);
      alert('Kunne ikke slette beskeden.');
      return;
    }
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
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
      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-[340px,1fr] gap-4 md:gap-6">
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
                  <label className="block text-sm mb-1">Modtager (visningsnavn)</label>
                  <input
                    list="alle-spillere"
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
                  <label className="block text-sm mb-1">Besked</label>
                  <input
                    value={composerBody}
                    onChange={(e) => setComposerBody(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Hej! Skal vi tage en kamp? 😊"
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
                    onClick={async () => {
                      if (sending) return;
                      setSending(true);
                      try {
                        await sendMessageByName(recipientName, composerBody);
                        setComposerBody('');
                        setRecipientName('');
                        setComposerOpen(false);
                      } finally {
                        setSending(false);
                      }
                    }}
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
            <div className="h-full rounded-2xl bg-white dark:bg-[#2a2a2a] shadow flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <button
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

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
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
                        <div className={`mt-1 text-[11px] opacity-80 ${mine ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
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

              {/* Composer */}
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <ThreadComposer
                  onSend={async (text) =>
                    sendMessageTo(
                      selectedThread.counterpartId,
                      selectedThread.counterpartName,
                      text
                    )
                  }
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ThreadComposer({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSend(text);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Skriv en besked…"
        className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
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
