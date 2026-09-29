import { RouteNotFound } from "@/components/route-not-found";
import {
  StandaloneFrame,
  standaloneFrameCopy,
} from "@/components/standalone-frame";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function NotFound() {
  const [locale, dictionary] = await Promise.all([
    getLocale(),
    getDictionary(),
  ]);
  return (
    <StandaloneFrame frame={standaloneFrameCopy(locale, dictionary)}>
      <RouteNotFound copy={dictionary.errorPages} home="site" />
    </StandaloneFrame>
  );
}
