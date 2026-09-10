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
  auth: {
    backToHome: "Back to the CareerMint home page",
    footer: "© 2026 CareerMint · Confirm the facts, then hand them to AI",
    productPrinciples: "Product principles",
    sidePanelBadge: "Your overseas job desk ↗",
    sidePanelTitle: "One profile you can stand behind, reused for every application.",
    principles: {
      oneTitle: "Facts get confirmed first",
      oneBody: "AI never writes a guess into your profile",
      twoTitle: "Every application is traceable",
      twoBody: "Resume versions sit next to the job's requirements",
      threeTitle: "Your data stays yours",
      threeBody: "Export it any time, or delete the account outright",
    },
    email: "Email",
    password: "Password",
    passwordPlaceholder: "At least 8 characters",
    forgotPassword: "Forgot your password?",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signUp: "Create an account",
    signingUp: "Creating…",
    backToSignIn: "Back to sign in",
    signUpNote:
      "We will email you a confirmation link. Third-party sign-in is not part of the MVP.",
    pages: {
      signInEyebrow: "Account access",
      signInTitle: "Welcome back. Let's get the next application ready.",
      signInBody:
        "Sign in, or create an account with your email. Your career facts, application versions and submission history all stay in your own workspace.",
      forgotEyebrow: "Account recovery",
      forgotTitle: "Reset your password",
      forgotBody:
        "Enter the email you signed up with. If an account exists we will send a one-time reset link; the page will not say whether the address is registered.",
      resetEyebrow: "Account security",
      resetTitle: "Choose a new password",
      resetBody:
        "Between 8 and 128 characters. Submitting takes you straight back to your job desk.",
    },
    callback: {
      invalidLink: "That confirmation link is invalid or has expired. Request a new one.",
      sessionNotCreated:
        "Your email may already be confirmed. Sign in with your email and password.",
      emailLinkUsed:
        "This email is already registered. The confirmation link may have been used or expired — sign in instead.",
    },
  },
  meta: {
    title: "CareerMint — an overseas job desk with evidence behind it",
    titleTemplate: "%s · CareerMint",
    description:
      "Match jobs against career facts you have confirmed, tailor your resume, track applications and prepare for interviews.",
  },
  landing: {
    beta: "Beta",
    signIn: "Sign in or create an account",
    navNote: "Build the profile first, then tailor it per job",
    badge: "No invented experience — just your real strengths, stated clearly",
    headlineTop: "Give every application",
    headlineBottom: "something to stand on",
    body: "Career profile, JD matching, resume versions, submission tracking and interview prep in one workspace. AI only uses facts you have confirmed, and tells you where every suggestion came from.",
    primaryCta: "Build my career profile",
    secondaryCta: "See how it works",
    principles: {
      sourced: "Facts have sources",
      explainable: "Changes are explainable",
      confirmed: "Writes need confirmation",
    },
    demo: {
      workspace: "Application workspace",
      role: "Senior Product Manager",
      pending: "1 to confirm",
      requirements: "Job requirements",
      parsed: "3 parsed",
      hasEvidence: "Evidence",
      needsConfirmation: "To confirm",
      growthExperiments: "Growth experiment experience",
      crossTeam: "Cross-team collaboration",
      germanB2: "German B2",
      aiTitle: "One thing worth adding",
      aiBody:
        "You mentioned a German market project — is there a language use case you can confirm?",
      nextStep: "Next",
      nextAction: "Confirm 1 fact",
      progressLabel: "2 of 3 requirements have evidence, 1 to confirm",
      progressNote: "3 requirements · 2 with evidence",
      viewSuggestions: "View suggestions",
      evidenceBadge: "AI suggestions carry evidence ↗",
    },
    workflow: {
      oneTitle: "Keep your career facts",
      oneBody: "Experience, projects and outcomes, each with a source",
      twoTitle: "Break down the job",
      twoBody: "Hard requirements separated from nice-to-haves",
      threeTitle: "Produce a version",
      threeBody: "Every edit can be explained",
    },
  },
  onboarding: {
    pageEyebrow: "Career profile setup",
    pageTitle: "Get your real experience in order first",
    pageBody:
      "About five minutes. You can skip the upload and the AI analysis; when you enter the job desk is your call.",
    privateBadge: "Private setup",
    stepsLabel: "Setup steps",
    steps: { goals: "Job goals", resume: "Upload a resume", facts: "Check the facts" },
    goalsEyebrow: "01 · Set the direction",
    goalsTitle: "Point the later suggestions at what you actually want",
    displayName: "Name",
    targetRole: "Target role",
    targetRolePlaceholder: "e.g. Product Analyst",
    targetCountries: "Target countries",
    targetCountriesPlaceholder: "Germany, Netherlands (optional)",
    jobSearchLanguage: "Application language",
    interfaceLanguage: "Interface language",
    timezone: "Time zone (IANA)",
    saving: "Saving…",
    saveGoals: "Save job goals",
    saveFailed: "Check the required fields and the time zone, then save again.",
    resumeEyebrow: "02 · Start from what you have",
    resumeTitle: "Upload a resume so you type less of it twice",
    aiConsent: "Let the system send the extracted resume text to an AI service for analysis",
    aiConsentNote:
      "Text only — never the original file — and every fact still needs your confirmation.",
    privacyLink: "Read about AI and your data",
    continueToFacts: "Continue to the facts",
    skipForNow: "Skip for now",
    checkLater: "Check them later",
    factsEyebrow: "03 · The last call is yours",
    factsTitle: "AI output is still an unconfirmed draft",
    factsBody:
      "Finishing this setup confirms nothing. No experience, number or skill is accepted until you check it in your career profile.",
    goToProfile: "Go and check the profile",
    nothingToCheck:
      "Nothing is waiting to be checked. You can go to the desk now and add facts by hand whenever you like.",
    entering: "Opening…",
    enterWorkspace: "Open the job desk",
    enterFailed: "Could not open the job desk. Try again in a moment.",
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
