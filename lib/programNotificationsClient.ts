export async function legacyProgramPushSummary(date: string) {
  try {
    const response = await fetch('/api/program-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!response.ok) throw new Error('Push request failed');
    return programPushSummary(await response.json());
  } catch {
    return programPushSummary({ sent: 0, failed: 1 });
  }
}

export function programPushSummary(push?: { sent: number; failed: number }) {
  if (!push) return '';
  return (push.sent ? `\nNotifikation sendt til ${push.sent} spillere.` : '') +
    (push.failed ? '\nNogle notifikationer kunne ikke sendes. Programmet er stadig udgivet.' : '');
}
