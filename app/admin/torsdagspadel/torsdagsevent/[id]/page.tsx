export const dynamic = "force-dynamic";

import TorsdagsEventClient from "../../event/[id]/TorsdagsEventClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TorsdagsEventClient key={id} eventId={id} />;
}
