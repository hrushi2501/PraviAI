import Link from "next/link";
import { z } from "zod";
import { AssetDetailWorkspace } from "@/components/asset-detail-workspace";
import { getAssetDetailAction } from "@/server/actions/asset.actions";
import { getComplaintsByAssetAction } from "@/server/actions/complaint.actions";
import { getAssetContextAction } from "@/server/actions/detail.actions";
import { getEvidenceByAssetAction } from "@/server/actions/evidence.actions";
import { getInspectionsByAssetAction } from "@/server/actions/inspection.actions";
import {
  getAssetWorkEstimatesAction,
  getWorkOrdersByAssetAction,
} from "@/server/actions/work-order.actions";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return <p role="alert">This asset reference is invalid.</p>;
  const [detail, context] = await Promise.all([
    getAssetDetailAction(id),
    getAssetContextAction(id),
  ]);
  if (!detail.success || !context.success)
    return (
      <div role="alert" className="rounded-lg border bg-white p-5">
        Asset data could not be loaded. Your access or database connection may
        need attention.{" "}
        <Link className="underline" href="/app/assets">
          Return to inventory
        </Link>
      </div>
    );
  if (!detail.data || !context.data)
    return (
      <div className="rounded-lg border bg-white p-5">
        This asset is unavailable in your authorized scope.{" "}
        <Link className="underline" href="/app/assets">
          Return to inventory
        </Link>
      </div>
    );
  const [inspections, works, complaints, evidence, estimates] =
    await Promise.all([
      getInspectionsByAssetAction(id),
      getWorkOrdersByAssetAction(id),
      getComplaintsByAssetAction(id),
      getEvidenceByAssetAction(id),
      getAssetWorkEstimatesAction(id),
    ]);
  const {
    asset,
    permissions,
    actorId,
    history,
    components,
    duplicateCandidates,
  } = context.data;
  const condition = detail.data.condition;

  return (
    <AssetDetailWorkspace
      id={id}
      asset={asset}
      condition={condition}
      permissions={permissions}
      actorId={actorId}
      history={history}
      components={components}
      duplicateCandidates={duplicateCandidates}
      inspections={inspections}
      works={works}
      complaints={complaints}
      evidence={evidence}
      estimates={estimates}
    />
  );
}
