'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/messages';
import { matchTimeLabel, type PlayerMatch } from '@/lib/playerMatches';

export type Thread = {
  counterpartId: string;
  counterpartName: string;
  lastMessage: Message;
  unread: number;
};

type IconName = 'back' | 'chat' | 'compose' | 'search' | 'send' | 'trash' | 'down';
const paths: Record<IconName, string> = {
  back: 'M19 12H5m7 7-7-7 7-7',
  chat: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.6-3.2A7.5 7.5 0 1 1 20 11.5Z',
  compose: 'M12 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7m3.5 1.5 3 3M10 14l1-4 7-7 3 3-7 7-4 1Z',
  search: 'M21 21l-4.3-4.3m2.3-5.7a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  send: 'm22 2-7 20-4-9-9-4 20-7ZM11 13 22 2',
  trash: 'M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v7m4-7v7',
  down: 'M12 5v14m-6-6 6 6 6-6',
};

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('da-DK');
  return <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f7e3ee] text-sm font-extrabold text-[#96245b] dark:bg-[#50213d] dark:text-pink-200">{initials || '?'}</span>;
}

const clock = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' });
const day = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Copenhagen' });
function previewTime(value: string) {
  const date = new Date(value);
  if (day.format(date) === day.format(new Date())) return clock.format(date);
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' }).format(date);
}

const primary = 'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#bc135d] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#a30e4e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:opacity-50';
const control = 'w-full rounded-xl border border-[#e6dee5] bg-white px-3 py-2.5 text-base text-[#262337] outline-none placeholder:text-[#716b79] focus:border-pink-600 focus:ring-2 focus:ring-pink-200 dark:border-white/15 dark:bg-[#242235] dark:text-white dark:placeholder:text-[#aba6ba]';

export function InboxView(props: {
  meId: string;
  threads: Thread[];
  matchThreads?: PlayerMatch[];
  selectedThread: Thread | null;
  messages: Message[];
  view: 'list' | 'thread';
  onOpenThread: (id: string) => void;
  onBack: () => void;
  composing: boolean;
  onCompose: () => void;
  onCloseCompose: () => void;
  names: string[];
  recipient: string;
  onRecipient: (name: string) => void;
  newBody: string;
  onNewBody: (value: string) => void;
  sending: boolean;
  onSendNew: () => void;
  reply: string;
  onReply: (value: string) => void;
  onSendReply: (value: string) => Promise<boolean>;
  onDelete: (message: Message) => void;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  error: string | null;
  notice: string | null;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('da-DK');
  const filtered = props.threads.filter(thread => thread.counterpartName.toLocaleLowerCase('da-DK').includes(needle));
  const showList = !props.composing && props.view === 'list';
  const thread = props.selectedThread;

  return (
    <main className={`flex flex-col bg-[#f5f3f8] text-[#262337] dark:bg-[#161524] dark:text-[#f6f3fa] md:h-[100dvh] md:overflow-hidden ${showList ? "min-h-[100dvh]" : "h-[100dvh] overflow-hidden"}`}>
      <div className="mx-auto flex w-full max-w-[1180px] min-h-0 flex-1 flex-col md:px-6 md:pb-6">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-0 md:py-4">
          <Link href="/startside" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-bold text-[#55495e] hover:text-[#a30e4e] dark:text-[#e2d9e7]">
            <Icon name="back" /> Forside
          </Link>
          <span className="text-xs font-extrabold tracking-[.12em] text-[#72566b] uppercase dark:text-[#c5a9be]">Padelhuset</span>
        </header>
        {props.error && <p role="alert" className="mx-4 mb-2 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 md:mx-0">{props.error}</p>}
        {props.notice && <p role="status" className="mx-4 mb-2 shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 md:mx-0">{props.notice}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-1 border-[#e5dde8] bg-white dark:border-white/10 dark:bg-[#201e31] md:grid-cols-[minmax(270px,330px)_minmax(0,1fr)] md:overflow-hidden md:rounded-2xl md:border">
          <aside aria-label="Samtaler" className={`${showList ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col border-[#ece5ef] dark:border-white/10 md:flex md:border-r`}>
            <div className="shrink-0 border-b border-[#ece5ef] px-4 pb-4 pt-4 dark:border-white/10">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h1 className="text-2xl font-black tracking-tight">Beskeder</h1>
                <button type="button" onClick={props.onCompose} className={primary}>
                  <Icon name="compose" className="h-4 w-4" /> Ny besked
                </button>
              </div>
              <label className="relative block">
                <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#74657d] dark:text-[#bab0c4]" />
                <input type="search" aria-label="Søg i samtaler" placeholder="Søg efter en spiller" className={control + ' pl-9'} value={query} onChange={event => setQuery(event.target.value)} />
              </label>
            </div>
            <div className="min-h-0 flex-1 md:overflow-y-auto">
              {filtered.length ? <ul className="space-y-1 p-2">
                {filtered.map(item => {
                  const active = !props.composing && item.counterpartId === thread?.counterpartId;
                  const mine = item.lastMessage.sender_id === props.meId;
                  return <li key={item.counterpartId}>
                    <button type="button" aria-current={active ? 'true' : undefined} onClick={() => props.onOpenThread(item.counterpartId)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-pink-600 ${active ? 'bg-[#f9eaf2] dark:bg-[#3b233b]' : 'hover:bg-[#f7f3f8] dark:hover:bg-white/5'}`}>
                      <Avatar name={item.counterpartName} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-extrabold">{item.counterpartName}</span>
                          <time className="shrink-0 text-xs text-[#716b79] dark:text-[#b9b1c3]" dateTime={item.lastMessage.created_at}>{previewTime(item.lastMessage.created_at)}</time>
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${item.unread ? 'font-bold' : 'text-[#716b79] dark:text-[#b9b1c3]'}`}>{mine && 'Du: '}{item.lastMessage.body}</span>
                          {item.unread > 0 && <span aria-label={`${item.unread} ulæste`} className="grid min-h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#bc135d] px-1 text-xs font-bold text-white">{item.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>;
                })}
              </ul> : <p className="px-5 py-8 text-sm text-[#716b79] dark:text-[#b9b1c3]">{needle ? 'Ingen samtaler matcher din søgning.' : props.matchThreads?.length ? 'Ingen private samtaler endnu.' : 'Her kommer dine samtaler. Tryk på Ny besked for at skrive til en spiller.'}</p>}
              {!!props.matchThreads?.length && <div className="border-t border-[#ece5ef] px-3 py-3 dark:border-white/10">
                <h2 className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-[#716b79] dark:text-[#b9b1c3]">Kamptråde</h2>
                {props.matchThreads.filter(match => match.players.some(player => player.name.toLocaleLowerCase('da-DK').includes(needle)))
                  .map(match => <Link key={match.id} href={`/kampe/${match.id}#samtale`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-[#f7f3f8] dark:hover:bg-white/5">
                    <Avatar name="Kamp" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{match.league_pool_id ? "Makkerliga · " : ""}{matchTimeLabel(match)}</span>
                      <span className="block truncate text-sm text-[#716b79] dark:text-[#b9b1c3]">{match.last_message?.body ?? match.players.map(player => player.name).join(', ')}</span>
                    </span>
                    {match.unread > 0 && <span aria-label={`${match.unread} ulæste`} className="rounded-full bg-[#bc135d] px-2 py-0.5 text-xs font-bold text-white">{match.unread}</span>}
                  </Link>)}
              </div>}
              {props.hasOlder && <button type="button" onClick={props.onLoadOlder} disabled={props.loadingOlder} className="mx-4 mb-4 rounded-lg px-2 py-2 text-sm font-bold text-[#a30e4e] dark:text-pink-300">{props.loadingOlder ? 'Henter…' : 'Hent ældre beskeder'}</button>}
            </div>
          </aside>

          <section aria-label={props.composing ? 'Ny besked' : 'Valgt samtale'} className={`${showList ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-col md:flex`}>
            {props.composing ? <>
              <div className="flex shrink-0 items-center gap-3 border-b border-[#ece5ef] px-4 py-3 dark:border-white/10 md:px-6">
                <button type="button" onClick={props.onCloseCompose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10" aria-label="Tilbage til samtaler"><Icon name="back" /></button>
                <h2 className="text-lg font-extrabold">Ny besked</h2>
              </div>
              <form className="mx-auto w-full max-w-xl space-y-5 overflow-y-auto p-4 md:p-7" onSubmit={event => { event.preventDefault(); props.onSendNew(); }}>
                <label className="block text-sm font-bold">
                  Til
                  <input list="message-players" disabled={props.sending} value={props.recipient} onChange={event => props.onRecipient(event.target.value)} placeholder="Find en spiller" className={control + ' mt-1.5'} />
                </label>
                <datalist id="message-players">{props.names.map(name => <option key={name} value={name} />)}</datalist>
                <MessageField text={props.newBody} onChange={props.onNewBody} disabled={props.sending} rows={5} />
                <div className="flex justify-end">
                  <SendButton busy={props.sending} disabled={!props.recipient.trim() || !props.newBody.trim()} />
                </div>
              </form>
            </> : thread ? <>
              <div className="flex shrink-0 items-center gap-3 border-b border-[#ece5ef] px-4 py-3 dark:border-white/10 md:px-6">
                <button type="button" aria-label="Tilbage til samtaler" onClick={props.onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 md:hidden"><Icon name="back" /></button>
                <Avatar name={thread.counterpartName} />
                <h2 className="min-w-0 truncate text-base font-extrabold">{thread.counterpartName}</h2>
              </div>
              <MessageTimeline key={`history-${thread.counterpartId}`} messages={props.messages} meId={props.meId} onDelete={props.onDelete} visible={!showList} />
              <ReplyComposer key={`reply-${thread.counterpartId}`} text={props.reply} onChange={props.onReply} onSend={props.onSendReply} />
            </> : <div className="grid min-h-[320px] flex-1 place-items-center bg-[#faf8fb] p-8 text-center dark:bg-[#191828]">
              <div>
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#f7e3ee] text-[#96245b] dark:bg-[#50213d] dark:text-pink-200"><Icon name="chat" /></span>
                <h2 className="text-xl font-extrabold">Vælg en samtale</h2>
                <p className="mt-2 text-sm text-[#716b79] dark:text-[#b9b1c3]">Eller skriv en ny besked til en spiller.</p>
              </div>
            </div>}
          </section>
        </div>
      </div>
    </main>
  );
}

export function MessageTimeline<T extends Pick<Message, 'id' | 'sender_id' | 'body' | 'created_at'>>({ messages, meId, onDelete, visible, senderName }: {
  messages: T[]; meId: string; onDelete?: (message: T) => void; visible: boolean; senderName?: (id: string) => string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const previous = useRef<{ first?: string; last?: string; height: number } | null>(null);
  const nearBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const first = messages[0]?.id;
  const last = messages.at(-1)?.id;

  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || !el.clientHeight) return;
    const before = previous.current;
    if (!before || nearBottom.current) el.scrollTop = el.scrollHeight;
    else if (before.first !== first && before.last === last) el.scrollTop += el.scrollHeight - before.height;
    else if (before.last !== last) setShowLatest(true);
    previous.current = { first, last, height: el.scrollHeight };
  }, [first, last, visible]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroll} role="region" aria-label="Beskedhistorik" tabIndex={0} onScroll={event => {
        const el = event.currentTarget;
        nearBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
        if (nearBottom.current) setShowLatest(false);
      }} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#faf8fb] px-4 py-4 [overflow-anchor:none] dark:bg-[#191828] md:px-6">
        {messages.map((message, index) => {
          const mine = message.sender_id === meId;
          const date = new Date(message.created_at);
          const dateLabel = day.format(date);
          const newDay = !index || dateLabel !== day.format(new Date(messages[index - 1].created_at));
          return <div key={message.id}>
            {newDay && <div className="my-3 flex items-center gap-3 text-xs font-bold text-[#716b79] dark:text-[#b9b1c3]"><span className="h-px flex-1 bg-[#e8dfea] dark:bg-white/10" />{dateLabel}<span className="h-px flex-1 bg-[#e8dfea] dark:bg-white/10" /></div>}
            <div className={`flex items-end gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
              {mine && onDelete && <button type="button" onClick={() => onDelete(message)} aria-label="Slet besked for begge" className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#716b79] hover:bg-pink-100 hover:text-red-800 dark:text-[#b9b1c3] dark:hover:bg-white/10"><Icon name="trash" className="h-4 w-4" /></button>}
              <div className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2 md:max-w-[75%] ${mine ? 'rounded-br-md bg-[#bc135d] text-white' : 'rounded-bl-md border border-[#e8dfea] bg-white dark:border-white/10 dark:bg-[#2a273e]'}`}>
                {!mine && senderName && <p className="mb-1 text-xs font-bold">{senderName(message.sender_id)}</p>}
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">{message.body}</p>
                <time className={`mt-1 block text-right text-[11px] ${mine ? 'text-pink-100' : 'text-[#716b79] dark:text-[#b9b1c3]'}`} dateTime={message.created_at}>{clock.format(date)}</time>
              </div>
            </div>
          </div>;
        })}
      </div>
      {showLatest && <button type="button" onClick={() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; setShowLatest(false); }} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-pink-200 bg-white px-3 py-2 text-sm font-bold text-[#a30e4e] shadow">
        <Icon name="down" className="h-4 w-4" /> Nyeste beskeder
      </button>}
    </div>
  );
}

function MessageField({ text, onChange, disabled, rows }: { text: string; onChange: (value: string) => void; disabled: boolean; rows: number }) {
  return <div className="min-w-0 flex-1">
    <textarea aria-label="Besked" className={control + ' block max-h-40 resize-y'} rows={rows} value={text} maxLength={5000} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Skriv din besked…" />
    <p className="mt-1.5 text-xs text-[#716b79] dark:text-[#b9b1c3]">Enter laver linjeskift.</p>
  </div>;
}

function SendButton({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  return <button type="submit" disabled={busy || disabled} className={primary}><Icon name="send" className="h-4 w-4" />{busy ? 'Sender…' : 'Send'}</button>;
}

export function ReplyComposer({ text, onChange, onSend }: { text: string; onChange: (value: string) => void; onSend: (value: string) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  return <form className="flex shrink-0 items-start gap-2 border-t border-[#ece5ef] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 md:px-6" onSubmit={async event => {
    event.preventDefault();
    if (sending.current || !text.trim()) return;
    sending.current = true; setBusy(true);
    try { if (await onSend(text)) onChange(''); }
    finally { sending.current = false; setBusy(false); }
  }}>
    <MessageField text={text} onChange={onChange} disabled={busy} rows={2} />
    <SendButton busy={busy} disabled={!text.trim()} />
  </form>;
}
