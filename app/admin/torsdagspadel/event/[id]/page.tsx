export const dynamic = 'force-dynamic';
import EventAdminTorsdagClient from './EventAdminTorsdagClient';

export default function Page({ params }: any) {
  return <EventAdminTorsdagClient eventId={params.id as string} />;
}

