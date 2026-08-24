import type {
  RequirementMatchStatus,
  RequirementPriority,
} from "./schemas";

type OrderableRequirement = {
  matchStatus: RequirementMatchStatus;
  priority: RequirementPriority;
  sortOrder: number;
};

const matchRank: Record<RequirementMatchStatus, number> = {
  none: 0,
  needs_user: 1,
  partial: 2,
  evidence: 3,
};

const priorityRank: Record<RequirementPriority, number> = {
  core: 0,
  supporting: 1,
};

export function compareRequirements(
  left: OrderableRequirement,
  right: OrderableRequirement,
) {
  return (
    matchRank[left.matchStatus] - matchRank[right.matchStatus] ||
    priorityRank[left.priority] - priorityRank[right.priority] ||
    left.sortOrder - right.sortOrder
  );
}

export function orderRequirements<T extends OrderableRequirement>(
  requirements: readonly T[],
): T[] {
  return requirements
    .map((requirement, index) => ({ requirement, index }))
    .sort(
      (left, right) =>
        compareRequirements(left.requirement, right.requirement) ||
        left.index - right.index,
    )
    .map(({ requirement }) => requirement);
}
