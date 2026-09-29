import { RouteNotFound } from "@/components/route-not-found";
import { getDictionary } from "@/i18n/server";

export default async function NotFound() {
  const { errorPages } = await getDictionary();
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <RouteNotFound copy={errorPages} home="site" />
    </main>
  );
}
