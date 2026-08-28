import Link from "next/link";

import type { ResumeJDDifferenceRun } from "./repository";
import type {
  DifferenceAuthenticity,
  DifferenceIssue,
  DifferenceIssueType,
  ImprovementDirection,
  ImprovementFocusArea,
  ResumeTargetSection,
} from "./schemas";

export type ResumeJDImprovementPanelProps = {
  applicationId: string;
  run: ResumeJDDifferenceRun | null;
  freshness: "current" | "stale" | "missing";
};

const groupOrder = [
  "岗位语言未对齐",
  "经历证据需要加强",
  "关键词位置较弱",
  "需要本人确认",
  "不能通过改简历解决",
] as const;

type ImprovementGroup = (typeof groupOrder)[number];

const groupByIssueType: Record<DifferenceIssueType, ImprovementGroup> = {
  missing: "需要本人确认",
  language_misaligned: "岗位语言未对齐",
  profile_only: "经历证据需要加强",
  skill_only: "关键词位置较弱",
  too_vague: "经历证据需要加强",
  missing_context: "经历证据需要加强",
  missing_result: "经历证据需要加强",
  needs_confirmation: "需要本人确认",
  gate: "不能通过改简历解决",
};

const targetSectionCopy: Record<ResumeTargetSection, string> = {
  summary: "个人总结",
  experience: "工作经历",
  project: "项目经历",
  skills: "技能",
  education: "教育",
  languages: "语言",
  other: "其他",
};

const focusAreaCopy: Record<ImprovementFocusArea, string> = {
  action: "动作",
  context: "场景",
  stakeholders: "协作对象",
  method: "方法",
  result: "结果",
  placement: "位置",
};

const authenticityCopy: Record<DifferenceAuthenticity, string> = {
  supported: "当前简历有可回查证据",
  profile_only: "职业档案有已确认事实，当前简历未体现",
  needs_confirmation: "需要本人确认",
  unsupported: "当前材料没有可回查证据",
};

const groupIntro: Record<ImprovementGroup, string> = {
  岗位语言未对齐: "经历本身有关联，但尚未使用这个岗位通常采用的表达方式。",
  经历证据需要加强: "补足真实的动作、场景、方法或结果，让现有经历更容易被识别。",
  关键词位置较弱: "关键词虽然存在，但还没有放进能够证明它的真实经历中。",
  需要本人确认: "现有材料不足以判断。请先回忆并确认真实经历，再决定是否补充。",
  不能通过改简历解决: "这是资格或条件门槛，不能通过调整措辞改变真实情况。",
};

export function improvementGroupForIssue(
  type: DifferenceIssueType,
): ImprovementGroup {
  return groupByIssueType[type];
}

function targetCopy(direction: ImprovementDirection | null) {
  if (!direction) return "按真实情况核实";
  const section = targetSectionCopy[direction.targetSection];
  return direction.targetExperienceZh
    ? `${section} · ${direction.targetExperienceZh}`
    : section;
}

function uniqueTerms(direction: ImprovementDirection) {
  return [...new Set([...direction.jdTerms, ...direction.synonymousJobLanguage])];
}

function synthesizedGateDirection(issue: DifferenceIssue) {
  return {
    target: "资格条件",
    focus: "真实情况",
    authenticity: authenticityCopy[issue.authenticity],
    direction:
      "这是资格门槛，不能通过调整简历措辞解决。请按真实情况核实并呈现。",
  };
}

function ImprovementItem({
  issue,
  direction,
}: {
  issue: DifferenceIssue;
  direction: ImprovementDirection | null;
}) {
  const isGate = issue.isGate || issue.type === "gate";
  const unsupported =
    issue.authenticity === "unsupported" ||
    direction?.authenticity === "unsupported";
  const gateDirection = isGate ? synthesizedGateDirection(issue) : null;
  const terms = direction && !unsupported ? uniqueTerms(direction) : [];

  return (
    <article
      className="border-t border-[var(--line)] px-5 py-5 first:border-t-0 sm:px-6"
      data-testid={`improvement-item-${issue.id}`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            对应差异
          </p>
          <p className="mt-2 text-base font-black leading-7">
            {issue.jdTranslationZh}
          </p>
          <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm font-bold leading-6">
            {gateDirection?.direction ?? direction?.directionZh ?? issue.problemZh}
          </p>
          {unsupported ? (
            <p className="mt-3 rounded-xl border-2 border-[var(--coral)] bg-white px-4 py-3 text-sm font-black leading-6">
              当前材料没有可回查证据。如未实际做过，请不要加入简历。
            </p>
          ) : null}
        </div>

        <dl className="grid content-start gap-4 rounded-2xl border border-[var(--line)] bg-white p-4">
          <div>
            <dt className="text-xs font-black text-[var(--ink-muted)]">目标位置</dt>
            <dd className="mt-1 text-sm font-black leading-6">
              {gateDirection?.target ?? targetCopy(direction)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black text-[var(--ink-muted)]">完善重点</dt>
            <dd className="mt-1 text-sm font-bold leading-6">
              {gateDirection?.focus ??
                (direction?.focusAreas.length
                  ? direction.focusAreas.map((area) => focusAreaCopy[area]).join(" · ")
                  : "核实真实经历")}
            </dd>
          </div>
          {terms.length ? (
            <div>
              <dt className="text-xs font-black text-[var(--ink-muted)]">
                岗位原词 / 同义表达
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {terms.map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-[var(--ink)] bg-[var(--mist-blue)] px-3 py-1 text-xs font-black"
                    lang="und"
                  >
                    {term}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-black text-[var(--ink-muted)]">真实性</dt>
            <dd className="mt-1 text-sm font-bold leading-6">
              {gateDirection?.authenticity ??
                authenticityCopy[direction?.authenticity ?? issue.authenticity]}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function Prerequisite({
  applicationId,
  stale,
}: {
  applicationId: string;
  stale: boolean;
}) {
  return (
    <section className="dense-surface px-5 py-8 sm:px-6">
      <h2 className="heading-font text-2xl font-black">
        {stale ? "材料已变化，请重新分析" : "请先完成差异分析"}
      </h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
        完善方向只会基于当前 JD、所选简历和可回查事实生成。
      </p>
      <Link
        className="mt-5 inline-flex rounded-xl border-2 border-[var(--ink)] bg-[var(--cream)] px-4 py-2 text-sm font-black shadow-[3px_3px_0_var(--ink)]"
        href={`/applications/${applicationId}?tab=difference`}
      >
        前往差异分析
      </Link>
    </section>
  );
}

export function ResumeJDImprovementPanel({
  applicationId,
  run,
  freshness,
}: ResumeJDImprovementPanelProps) {
  if (
    freshness !== "current" ||
    !run ||
    run.status !== "succeeded" ||
    !run.result
  ) {
    return (
      <Prerequisite
        applicationId={applicationId}
        stale={freshness === "stale"}
      />
    );
  }

  const directions = new Map(
    run.result.directions.map((direction) => [direction.issueId, direction]),
  );
  const grouped = new Map<ImprovementGroup, DifferenceIssue[]>();
  for (const issue of run.result.issues) {
    const group = improvementGroupForIssue(issue.type);
    grouped.set(group, [...(grouped.get(group) ?? []), issue]);
  }

  return (
    <section
      className="space-y-8"
      aria-labelledby="improvement-panel-title"
      data-run-id={run.id}
    >
      <header className="sticker-border bg-[var(--mint)] p-5 shadow-[6px_6px_0_var(--ink)] sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          Grounded guidance
        </p>
        <h2 id="improvement-panel-title" className="heading-font mt-1 text-2xl font-black sm:text-3xl">
          完善建议
        </h2>
        <p className="mt-3 max-w-4xl text-sm font-bold leading-7">
          用岗位能够识别的语言重新表达真实经历，并把关键词放回动作、场景和结果中；这里不会替你编造经历或直接改写简历。
        </p>
      </header>

      {groupOrder.map((group) => {
        const issues = grouped.get(group);
        if (!issues?.length) return null;
        return (
          <section key={group} aria-labelledby={`improvement-group-${group}`}>
            <div className="mb-3">
              <h2 id={`improvement-group-${group}`} className="heading-font text-2xl font-black">
                {group}
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
                {groupIntro[group]}
              </p>
            </div>
            <div className="dense-surface overflow-hidden">
              {issues.map((issue) => (
                <ImprovementItem
                  key={issue.id}
                  issue={issue}
                  direction={directions.get(issue.id) ?? null}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="sticker-border grid gap-4 bg-[var(--cream)] p-5 shadow-[5px_5px_0_var(--ink)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Optional next step
          </p>
          <h2 className="heading-font mt-1 text-xl font-black">下一步：准备面试</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            完善建议是独立参考。你可以继续核对简历，也可以进入面试准备。
          </p>
        </div>
        <Link
          className="inline-flex justify-center rounded-xl border-2 border-[var(--ink)] bg-white px-4 py-3 text-sm font-black shadow-[3px_3px_0_var(--ink)]"
          href={`/applications/${applicationId}?tab=interview`}
        >
          进入面试准备
        </Link>
      </section>
    </section>
  );
}
