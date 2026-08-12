export const dynamic = "force-dynamic";

import TorsdagsEventClient from "../../event/[id]/TorsdagsEventClient";

export default function Page({ params }: any) {
  return <TorsdagsEventClient eventId={params.id as string} />;
}
