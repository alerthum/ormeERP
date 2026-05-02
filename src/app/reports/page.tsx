import { AppShell } from "@/components/app-shell";
import { SimpleModulePage } from "@/components/pages";

export default function Page() {
  return <AppShell><SimpleModulePage kind="reports" /></AppShell>;
}
