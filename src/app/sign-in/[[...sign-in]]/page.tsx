import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/sign-in-panel";

export default async function SignInPage() {
  const { userId } = await auth();
  if (userId) redirect("/app/dashboard");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight">Pravi AI</p>
        <h1 className="mt-2 text-sm text-muted-foreground">
          Sign in to the Public Asset Register
        </h1>
      </div>
      <SignInPanel />
      <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
        Department access is assigned by your administrator.
      </p>
    </main>
  );
}
