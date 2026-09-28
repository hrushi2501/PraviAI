import { OperationalQueue } from "@/components/operational-queue";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  return (
    <OperationalQueue kind="work" department={params.department} page={page} />
  );
}
