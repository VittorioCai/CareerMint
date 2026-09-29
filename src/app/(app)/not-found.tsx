import { RouteNotFound } from "@/components/route-not-found";
import { getDictionary } from "@/i18n/server";

/** `notFound()` from a signed-in page lands here, with the shell intact. */
export default async function AppNotFound() {
  const { errorPages } = await getDictionary();
  return <RouteNotFound copy={errorPages} home="desk" />;
}
