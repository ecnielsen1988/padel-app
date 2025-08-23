// app/beskeder/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

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

export default function BeskederPage() {
  const [meId, setMeId] = useState<string | null>(null);
  const [meName, setMeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<'inbox' | 'sent' | 'all'>('inbox');

  // Composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [sending, setSending] = useState(false);
  const [allNames, setAllNames] = useState<string[]>([]);

  // Ekspansion
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Session
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

      // Profilnavn (robust)
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

      // Autocomplete navne
      const { data: names } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .order('visningsnavn');

      if (mounted) {
        setAllNames((names ?? []).map((n: any) => n.visningsnavn));
      }

      // Hent beskeder (mine indgående og udgående)
      const { data: msgs } = await supabase
        .from('beskeder')
        .select('*')
        .or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (mounted) {
        setMessages((msgs ?? []) as Message[]);
        setLoading(false);
      }
    })();

    // Realtime: INSERT + DELETE
    const channel = supabase
      .channel('beskeder-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beskeder' },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id === meId || m.recipient_id === meId) {
            setMessages((prev) => [m, ...prev]);
          }
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
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [meId]);

  // Afledt
  const inbox = useMemo(
    () => messages.filter((m) => m.recipient_id === meId),
    [messages, meId]
  );
  const sent = useMemo(
    () => messages.filter((m) => m.sender_id === meId),
    [messages, meId]
  );
  const filtered = filter === 'inbox' ? inbox : filter === 'sent' ? sent : messages;

  const unreadCount = inbox.filter((m) => !m.read_at).length;

  // Markér som læst (kun hvis jeg er modtager)
  async function markRead(id: string) {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return setOpenId(id);

    if (msg.recipient_id !== meId || msg.read_at) {
      setOpenId(id);
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('beskeder')
      .update({ read_at: now })
      .eq('id', id);

    if (!error) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read_at: now } : m)));
    }
    setOpenId(id);
  }

  // Send ny besked
  async function sendMessage(toName: string, body: string) {
    if (!meId || !meName) {
      alert('Du skal være logget ind.');
      return;
    }
    if (!toName.trim() || !body.trim()) return;

    const { data: recipient, error: recErr } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('visningsnavn', toName.trim())
      .maybeSingle();

    if (recErr || !recipient) {
      alert('Kunne ikke finde modtageren.');
      return;
    }

    const row = {
      sender_id: meId,
      sender_visningsnavn: meName,
      recipient_id: recipient.id,
      recipient_visningsnavn: recipient.visningsnavn,
      body: body.trim(),
    };

    const { data, error } = await supabase.from('beskeder').insert(row).select('*').single();
    if (error) {
      console.error(error);
      alert('Kunne ikke sende beskeden.');
      return;
    }
    setMessages((prev) => [data as Message, ...prev]);
  }

  async function handleSendFromComposer() {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage(recipientName, composerBody);
      setComposerBody('');
      setRecipientName('');
      setComposerOpen(false);
    } finally {
      setSending(false);
    }
  }

  // Hard delete (afsender altid)
  function canHardDelete(m: Message, id: string | null) {
    return !!id && m.sender_id === id;
  }

  async function hardDeleteEverywhere(m: Message) {
    const ok = confirm('Slet denne besked for begge parter? Dette kan ikke fortrydes.');
    if (!ok) return;

    const { error } = await supabase
      .from('beskeder')
      .delete()
      .eq('id', m.id);

    if (error) {
      console.error(error);
      alert('Kunne ikke slette beskeden.');
      return;
    }
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  // UI
  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <p className="text-lg">⏳ Indlæser beskeder…</p>
      </div>
    );
  }

  if (!meId) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
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

  return (
    <main className="min-h-screen py-8 px-4 sm:px-8 md:px-12 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-pink-600">💬 Beskeder</h1>
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded-full text-sm ${filter === 'inbox' ? 'bg-pink-600 text-white' : 'bg-gray-200 dark:bg-[#2a2a2a]'}`}
              onClick={() => setFilter('inbox')}
            >
              Indbakke {unreadCount > 0 && <span className="ml-1 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>}
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm ${filter === 'sent' ? 'bg-pink-600 text-white' : 'bg-gray-200 dark:bg-[#2a2a2a]'}`}
              onClick={() => setFilter('sent')}
            >
              Sendt
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm ${filter === 'all' ? 'bg-pink-600 text-white' : 'bg-gray-200 dark:bg-[#2a2a2a]'}`}
              onClick={() => setFilter('all')}
            >
              Alle
            </button>
          </div>
        </div>

        {/* Composer */}
        <div className="mb-4">
          {!composerOpen ? (
            <button
              onClick={() => setComposerOpen(true)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-semibold py-3 px-5 shadow text-center"
            >
              ✍️ Skriv ny besked
            </button>
          ) : (
            <div className="rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#2a2a2a] shadow">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Modtager (visningsnavn)</label>
                  <input
                    list="alle-spillere"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Skriv eller vælg navn…"
                  />
                  <datalist id="alle-spillere">
                    {allNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm mb-1">Din besked</label>
                  <input
                    value={composerBody}
                    onChange={(e) => setComposerBody(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Hej! Skal vi tage en kamp? 😊"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2 justify-end">
                <button onClick={() => setComposerOpen(false)} className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700">
                  Annullér
                </button>
                <button
                  onClick={handleSendFromComposer}
                  disabled={sending || !recipientName.trim() || !composerBody.trim()}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60"
                >
                  {sending ? 'Sender…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">Ingen beskeder endnu.</p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((m) => {
              const mine = m.sender_id === meId;
              const unread = m.recipient_id === meId && !m.read_at;
              const counterpart = mine ? m.recipient_visningsnavn : m.sender_visningsnavn;
              const showHardDelete = canHardDelete(m, meId);

              return (
                <li
                  key={m.id}
                  className={`rounded-2xl p-4 sm:p-5 shadow cursor-pointer transition ${
                    unread ? 'bg-pink-50 dark:bg-pink-900/20' : 'bg-white dark:bg-[#2a2a2a]'
                  }`}
                  onClick={() => markRead(m.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">
                          {mine ? `Til: ${counterpart}` : `Fra: ${counterpart}`}
                        </span>
                        {unread && (
                          <span className="text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">
                            Ulæst
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                        {m.body}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                        {new Date(m.created_at).toLocaleString('da-DK')}
                      </div>
                      {showHardDelete && (
                        <button
                          type="button"
                          title="Slet besked for alle"
                          aria-label="Slet besked"
                          onClick={(e) => { e.stopPropagation(); hardDeleteEverywhere(m); }}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>

                  {openId === m.id && (
                    <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <p className="text-sm mb-3 whitespace-pre-wrap">{m.body}</p>
                      <HurtigSvar
                        defaultRecipient={counterpart}
                        onSend={async (text) => {
                          await sendMessage(counterpart, text);
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

// Hurtigsvar-komponent
function HurtigSvar({ defaultRecipient, onSend }: { defaultRecipient: string; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Svar til ${defaultRecipient}…`}
        className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-[#1e1e1e] p-2.5 outline-none focus:ring-2 focus:ring-pink-500"
      />
      <button
        onClick={async () => {
          if (!text.trim()) return;
          setBusy(true);
          try {
            await onSend(text);
            setText('');
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || !text.trim()}
        className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60"
      >
        {busy ? 'Sender…' : 'Send'}
      </button>
    </div>
  );
}

