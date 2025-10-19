// app/event/[id]/page.tsx  (SERVER – ingen "use client")
import EventAdminClient from "./EventAdminClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Next 15 kræver await her
  return <EventAdminClient eventId={id} />;
}

