// app/beskeder/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Message, sendDirectMessage } from '@/lib/messages';

import { InboxView, type Thread } from './InboxView';

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

  // Læs samtalen kronologisk med de nyeste beskeder ved skrivefeltet.
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
    if (!meId || !selectedThreadId || !visible || composerOpen || (!desktop && view !== 'thread')) return;
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
  }, [selectedThreadId, meId, selectedMessages, visible, desktop, view, composerOpen]);

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

  return (
    <InboxView
      meId={meId}
      threads={threads}
      selectedThread={selectedThread}
      messages={selectedMessages}
      view={view}
      onOpenThread={id => { setSelectedThreadId(id); setComposerOpen(false); setView('thread'); }}
      onBack={() => setView('list')}
      composing={composerOpen}
      onCompose={() => setComposerOpen(true)}
      onCloseCompose={() => setComposerOpen(false)}
      names={[...new Set(allNames)]}
      recipient={recipientName}
      onRecipient={setRecipientName}
      newBody={composerBody}
      onNewBody={setComposerBody}
      sending={sending}
      onSendNew={sendNewMessage}
      reply={threadDrafts[selectedThreadId ?? ''] ?? ''}
      onReply={text => {
        if (selectedThreadId) setThreadDrafts(prev => ({ ...prev, [selectedThreadId]: text }));
      }}
      onSendReply={text => selectedThreadId ? sendMessageTo(selectedThreadId, text) : Promise.resolve(false)}
      onDelete={hardDeleteEverywhere}
      hasOlder={hasOlder}
      loadingOlder={loadingOlder}
      onLoadOlder={loadOlder}
      error={error}
      notice={notice}
    />
  );
}
