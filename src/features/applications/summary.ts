import type { Application } from "./schemas";

export type ApplicationSummary = {
  total: number;
  active: number;
  submitted: number;
  interviews: number;
  offers: number;
  recent: Application[];
};

export function summarizeApplications(
  applications: Application[],
): ApplicationSummary {
  return {
    total: applications.length,
    active: applications.filter(
      (application) =>
        application.stage !== "rejected" && application.stage !== "withdrawn",
    ).length,
    submitted: applications.filter(
      (application) => application.stage !== "preparing",
    ).length,
    interviews: applications.filter(
      (application) => application.stage === "interview",
    ).length,
    offers: applications.filter((application) => application.stage === "offer")
      .length,
    recent: [...applications]
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
      .slice(0, 5),
  };
}
