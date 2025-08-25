'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { notifyUser } from '@/lib/notify';


export default function Udfordring({
  recipient,
  recipientElo,
  myName,
  myElo,
}: {
  recipient: string;
  recipientElo: number;
  myName: string | null | undefined;
  myElo: number | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const isSelf = !!myName && recipient === myName;
  const hasMyElo = typeof myElo === 'number' && !Number.isNaN(myElo);
  const inRange = hasMyElo ? Math.abs((myElo as number) - recipientElo) <= 250 : false;

  // 👉 Skjul HELE knappen hvis ikke tilladt
  if (isSelf) return null;
  if (!hasMyElo) return null;      // ukendt egen Elo ⇒ kan ikke vurdere range ⇒ skjul
  if (!inRange) return null;       // uden for ±250 ⇒ skjul

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setBody(`Hej ${recipient}! Frisk på en padelkamp? 🎾.`);
    setOpen(true);
  }

  async function sendMessage() {
    if (sending) return;
    setSending(true);
    try {
      // Sikkerhedstjek igen (klienten kan manipuleres)
      if (isSelf || !hasMyElo || !inRange) throw new Error('not-allowed');

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) { alert('Du skal være logget ind for at udfordre.'); return; }

      const { data: rec, error: recErr } = await supabase
        .from('profiles')
        .select('id, visningsnavn')
        .eq('visningsnavn', recipient)
        .maybeSingle();
      if (recErr || !rec) { alert('Kunne ikke finde spilleren.'); return; }

      const senderName = (user.user_metadata as any)?.visningsnavn ?? 'Ukendt spiller';

      const { error: insErr } = await supabase.from('beskeder').insert({
        sender_id: user.id,
        sender_visningsnavn: senderName,
        recipient_id: rec.id,
        recipient_visningsnavn: rec.visningsnavn,
        body: body.trim(),
      });
      if (insErr) throw insErr;

      // 🚀 Push til modtageren
try {
  await notifyUser({
    user_id: rec.id,
    title: 'Ny udfordring',
    body: `${senderName}: ${body.trim()}`,
    url: '/beskeder'
  });
} catch (e) {
  console.warn('Kunne ikke sende push (udfordring):', e);
}


      setOpen(false);
      setBody('');
      alert('Udfordring sendt!');
    } catch (e: any) {
      if (e?.message === 'not-allowed') {
        alert('Du kan kun udfordre spillere inden for ±250 Elo og ikke dig selv.');
      } else {
        console.error(e);
        alert('Noget gik galt. Prøv igen.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        title={`Udfordr ${recipient}`}
        aria-label={`Udfordr ${recipient}`}
        onClick={handleOpen}
        className="ml-1 shrink-0 text-xl leading-none hover:scale-110 transition"
      >
        🥊
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3"
             onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
             role="dialog" aria-modal="true">
          <div className="w-full sm:max-w-md bg-white dark:bg-[#2a2a2a] rounded-2xl shadow-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                Udfordr <span className="text-pink-600">{recipient}</span>
              </h2>
              <button className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      onClick={() => setOpen(false)} aria-label="Luk">✖</button>
            </div>

            <label className="block text-sm mb-2">Besked</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-[#1e1e1e] p-3 outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="Skriv din udfordring…"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)}
                      className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700">
                Annullér
              </button>
              <button type="button" onClick={sendMessage}
                      disabled={sending || !body.trim()}
                      className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60">
                {sending ? 'Sender…' : 'Send udfordring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

