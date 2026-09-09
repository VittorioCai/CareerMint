/**
 * The English dictionary, and the source of truth for what keys exist.
 *
 * Every other dictionary is typed as `Dictionary`, so a missing key is a
 * compile error and a stray one is too. That is the whole enforcement
 * mechanism — there is no runtime key lookup that can quietly return the key
 * name, and nothing that falls back to English at render time, because a page
 * that is half translated is worse than one that is not.
 *
 * Namespaces are per feature, and a client component receives only the
 * namespace it uses rather than the whole object. User content never lands
 * here: company names, JD text, resume excerpts and career facts stay in
 * whatever language the user wrote them in.
 */
export const en = {
  common: {
    productName: "CareerMint",
    productTagline: "Job desk",
    verifiedAccount: "Verified account",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    retry: "Try again",
    loading: "Loading…",
    language: "Language",
  },
  shell: {
    homeLink: "CareerMint home",
    newApplication: "New application",
    newApplicationShort: "New",
    primaryNavigation: "Primary navigation",
    nav: {
      home: "Home",
      applications: "Applications",
      profile: "Career profile",
      interview: "Interview prep",
    },
    safetyTitle: "How your material is used",
    safetyBody:
      "AI asks before it writes anything to your profile. Nothing changes silently.",
    accountMenu: "Account menu",
    accountSettings: "Account settings",
    privacySettings: "AI and data permissions",
    signOut: "Sign out",
    localeNotSaved:
      "This page switched, but the language could not be saved to your account. It may go back on your next device.",
  },
};

export type Dictionary = typeof en;
