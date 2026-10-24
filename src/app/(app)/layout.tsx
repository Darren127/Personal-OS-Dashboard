import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell signOut={signOut}>{children}</AppShell>;
}
