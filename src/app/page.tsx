import { getDictionary, getLocale } from "@/i18n/server";

import { HomeView } from "./home-view";

export default async function Home() {
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);
  return <HomeView locale={locale} dictionary={dictionary} />;
}
