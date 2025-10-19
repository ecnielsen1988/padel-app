// app/event/[id]/page.tsx  (SERVER COMPONENT – ingen "use client" her)
import EventAdminClient from "./EventAdminClient";

export default function Page({ params }: { params: { id: string } }) {
  return <EventAdminClient eventId={params.id} />;
}
