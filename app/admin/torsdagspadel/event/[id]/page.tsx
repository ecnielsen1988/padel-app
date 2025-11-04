export const dynamic = 'force-dynamic';
import EventAdminTorsdagClient from './EventAdminTorsdagClient';

export default function Page({ params }: { params: { id: string } }) {
  return <EventAdminTorsdagClient eventId={params.id} />;
}

