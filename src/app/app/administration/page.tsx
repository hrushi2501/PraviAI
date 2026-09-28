import { PageHeader } from "@/components/asset-ui";
import { AuthorityAdmin } from "@/components/authority-admin";

export default function AdministrationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Authority administration"
        description="Set up departments, regions, roles and staff access. Review governed changes before they take effect."
      />
      <AuthorityAdmin />
    </div>
  );
}
