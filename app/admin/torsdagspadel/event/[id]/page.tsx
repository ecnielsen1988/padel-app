export const dynamic = 'force-dynamic';
import EventAdminTorsdagClient from './EventAdminTorsdagClient';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventAdminTorsdagClient key={id} eventId={id} />;
}
