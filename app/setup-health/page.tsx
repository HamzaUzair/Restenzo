import { redirect } from "next/navigation";

// Setup Health has been removed from the Platform Admin panel. Keep this route
// as a lightweight redirect so old bookmarks don't 404 and the existing
// DashboardLayout allowlist pattern is respected.
export default function SetupHealthPage() {
  redirect("/dashboard");
}
