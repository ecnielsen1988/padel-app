export async function notifyUser(params: {
  user_id: string;
  title: string;
  body: string;
  url?: string;
}) {
  const res = await fetch('/api/notify-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '/', ...params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Kunne ikke sende push');
  return json;
}
