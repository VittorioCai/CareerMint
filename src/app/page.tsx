import { getDictionary } from "@/i18n/server";

import { HomeView } from "./home-view";

export default async function Home() {
  return <HomeView dictionary={await getDictionary()} />;
}
