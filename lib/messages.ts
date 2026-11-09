export type Message = {
  id: string;
  sender_id: string;
  sender_visningsnavn: string;
  recipient_id: string;
  recipient_visningsnavn: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export async function sendDirectMessage(recipientId: string, body: string): Promise<{ message: Message; push: { status: string } }> {
  const response = await fetch('/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientId, body }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Beskeden blev ikke sendt.');
  return result;
}
