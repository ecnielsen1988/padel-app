import { notFound } from 'next/navigation';
import MatchHub from '../MatchHub';
import { isMatchId } from '@/lib/playerMatches';

export const metadata = { title: 'Kampaftale' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMatchId(id)) notFound();
  return <MatchHub key={id} matchId={id} />;
}
