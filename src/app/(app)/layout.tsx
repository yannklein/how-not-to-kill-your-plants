import { InstallHint } from "@/components/install-hint";
import { TabBar } from "@/components/tab-bar";
import { Toaster } from "@/components/toaster";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <InstallHint />
      <div className="flex-1 pb-20">{children}</div>
      <TabBar />
      <Toaster />
    </>
  );
}
