import PartnerEventAdminClient from "./PartnerEventAdminClient";

export default async function MakkerEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerEventAdminClient eventId={id} />;
}
