import { ComplaintWorkspace } from "@/components/complaint-workspace";
import { getWorkspaceAction } from "@/server/actions/workspace.actions";

export default async function ComplaintsPage() {
  const workspace = await getWorkspaceAction();
  const departments = workspace.success ? workspace.data.departments : [];

  return <ComplaintWorkspace departments={departments} />;
}
