import { notFound } from "next/navigation";
import { isMatchId } from "@/lib/playerMatches";
import { PoolView } from "../pool-view";

export default async function LeaguePoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMatchId(id)) notFound();
  return <PoolView poolId={id} />;
}
