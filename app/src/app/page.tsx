import { redirect } from "next/navigation";
import rangesData from "@/data/ranges_gto.json";
import verifiedAhKd7cBundle from "@/data/verified_ahkd7c_texassolver.json";
import {
  importTexasSolverBundle,
  type RangesDataset,
  type TexasSolverBundleV1,
} from "@/lib/poker";
import { getKnowledgeSummary } from "@/lib/rag";
import { getServerSessionStatus } from "@/lib/server/serverSession";
import { PokerStudioApp } from "@/components/PokerStudioApp";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { state, authenticated } = await getServerSessionStatus();
  if (state !== "disabled" && !authenticated) {
    redirect("/login");
  }

  const dataset = rangesData as unknown as RangesDataset;
  const kbSummary = getKnowledgeSummary();
  const texasRes = importTexasSolverBundle(
    verifiedAhKd7cBundle as unknown as TexasSolverBundleV1,
  );
  const realSolvedSpots = texasRes.ok ? [texasRes.spot] : [];

  return (
    <PokerStudioApp
      spots={dataset.spots}
      realSolvedSpots={realSolvedSpots}
      totalChunks={kbSummary.totalChunks}
      videos={kbSummary.videos}
      authEnabled={state === "enforced"}
    />
  );
}
