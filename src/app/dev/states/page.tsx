import { notFound } from "next/navigation";

import { ResumeJDDifferencePanel } from "@/features/resume-jd-difference/difference-panel";
import type { ResumeJDDifferenceRun } from "@/features/resume-jd-difference/repository";
import type { ResumeJDDifferenceOutput } from "@/features/resume-jd-difference/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

/**
 * Every state of every surface, side by side.
 *
 * The happy path is the only state anyone designs by accident; empty, single,
 * crowded, and overlong are the ones that decide whether a product holds up.
 * This page exists so those four are as easy to look at as the first one — a
 * claim that a state was considered is only worth anything if you can point at
 * it.
 *
 * Development only: it renders fixtures, never a real account.
 */
export const dynamic = "force-static";

const applicationId = "11111111-1111-4111-8111-111111111111";
const factId = "44444444-4444-4444-8444-444444444444";

const facts: ConfirmedFactForAnalysis[] = [
  {
    id: factId,
    factType: "work_experience",
    title: "跨部门业务复盘",
    organization: "Northstar GmbH",
    description: "每季度与销售和运营复盘转化数据，输出改进项。",
    skills: ["SQL"],
    sourceExcerpt: "Ran quarterly reviews with sales and operations.",
  },
];

const shortJd = "Lead product discovery for a European marketplace team.";
const longJd =
  "Lead product discovery for a European marketplace team across three markets, working with business stakeholders in Berlin, Amsterdam and Paris to define, size and sequence opportunities; measure customer outcomes with SQL and dashboards, and present findings to the leadership team every quarter. German C1 is required, and prior experience in a regulated marketplace is strongly preferred.";

function issue(
  id: string,
  priority: "critical" | "important" | "minor",
  overrides: Partial<ResumeJDDifferenceOutput["issues"][number]> = {},
) {
  return {
    id,
    conceptId: "concept-1",
    jdOriginal: shortJd,
    jdTranslationZh: "岗位语言未对齐。",
    resumeExcerpt: "Worked with business teams on reports.",
    resumeStatusZh: "存在相邻协作经历。",
    profileFactIds: [] as string[],
    type: "language_misaligned" as const,
    problemZh: "岗位语言没有对齐。",
    reasonZh: "简历没有明确说明需求转化过程。",
    priority,
    isGate: false,
    authenticity: "supported" as const,
    ...overrides,
  };
}

function output(
  overrides: Partial<ResumeJDDifferenceOutput> = {},
): ResumeJDDifferenceOutput {
  return {
    jobCore: {
      missionZh: "通过数据和跨团队协作支持业务决策。",
      coreCapabilities: ["业务分析", "数据分析", "相关方协作"],
      concepts: [
        {
          id: "concept-1",
          labelZh: "业务分析",
          originalTerms: ["business analysis"],
          importanceReasonZh: "核心职责。",
          priority: "critical",
        },
      ],
      gates: [],
      preferredItems: [],
    },
    overallDifference: {
      summaryZh: "当前简历有数据经历，但岗位语言、场景和结果证据仍不完整。",
      topIssueIds: [],
    },
    issues: [issue("i1", "critical")],
    matched: [],
    directions: [],
    ...overrides,
  };
}

function run(result: ResumeJDDifferenceOutput): ResumeJDDifferenceRun {
  const timestamp = "2026-09-09T10:00:00.000Z";
  return {
    id: "33333333-3333-4333-8333-333333333333",
    applicationId,
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceAssetId: "22222222-2222-4222-8222-222222222222",
    sourceFilename: "resume-en.pdf",
    sourceSha256: "a".repeat(64),
    jdSha256: "b".repeat(64),
    factFingerprint: "c".repeat(64),
    inputHash: "d".repeat(64),
    provider: "fake",
    model: "fake",
    schemaVersion: "resume-jd-difference-v4",
    promptVersion: "resume-jd-difference-p1-v5.0",
    policyVersion: "resume-jd-difference-policy-v4.0",
    status: "succeeded",
    attemptCount: 1,
    result,
    aiUsage: {
      provider: "fake",
      model: "fake",
      requestId: null,
      usage: { inputCacheHitTokens: 0, inputCacheMissTokens: 1, outputTokens: 1 },
      priceScheduleVersion: null,
    },
    estimatedCostUsd: null,
    errorCode: null,
    errorMessage: null,
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function State({
  name,
  note,
  children,
}: {
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-[var(--line)] pb-2">
        <h2 className="heading-font text-base font-bold">{name}</h2>
        <p className="text-xs font-normal text-[var(--ink-muted)]">{note}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DevStatesPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const crowded = output({
    issues: [
      ...Array.from({ length: 9 }, (_, index) =>
        issue(`c${index}`, index < 3 ? "critical" : index < 6 ? "important" : "minor"),
      ),
      issue("gate", "critical", {
        type: "gate",
        isGate: true,
        jdOriginal: "German C1 is required.",
        jdTranslationZh: "岗位要求德语 C1。",
      }),
    ],
    matched: [
      {
        id: "m1",
        conceptId: "concept-1",
        jdOriginal: "Analyze business data.",
        jdTranslationZh: "分析业务数据。",
        resumeExcerpt: "Analyzed weekly user data.",
        profileFactIds: [factId],
        reasonZh: "简历已有直接的数据分析动作。",
      },
    ],
  });

  return (
    <main className="mx-auto max-w-[1040px] px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
        Development only
      </p>
      <h1 className="heading-font mt-2 type-page-title">
        状态矩阵
      </h1>
      <p className="mt-3 max-w-[62ch] type-caption text-[var(--ink-muted)]">
        每个界面的每个状态并排渲染。做完一个界面之前，这一页上它的每一格都要有内容 ——
        「设计了每个状态」这句话，只有能指着看才算数。
      </p>

      <div className="mt-10 flex flex-col gap-14">
        <State name="差异分析 · 无结果" note="只剩控制条，贴纸即控制条">
          <ResumeJDDifferencePanel
            applicationId={applicationId}
            run={null}
            facts={facts}
            control={
              <span className="text-sm font-medium text-[var(--ink-muted)]">
                （此处为分析控制条）
              </span>
            }
          />
        </State>

        <State name="差异分析 · 一条" note="最少的有结果状态">
          <ResumeJDDifferencePanel
            applicationId={applicationId}
            run={run(output())}
            facts={facts}
          />
        </State>

        <State
          name="差异分析 · 完全匹配"
          note="零条差异，只有已对上 —— 结论不该说得像失败"
        >
          <ResumeJDDifferencePanel
            applicationId={applicationId}
            run={run(
              output({
                overallDifference: {
                  summaryZh: "这份简历已经覆盖了这个岗位提出的每一项要求。",
                  topIssueIds: [],
                },
                issues: [],
                matched: [
                  {
                    id: "m1",
                    conceptId: "concept-1",
                    jdOriginal: "Analyze business data.",
                    jdTranslationZh: "分析业务数据。",
                    resumeExcerpt: "Analyzed weekly user data.",
                    profileFactIds: [factId],
                    reasonZh: "简历已有直接的数据分析动作。",
                  },
                ],
              }),
            )}
            facts={facts}
          />
        </State>

        <State name="差异分析 · 十一条" note="密度上限，排序与徽章编号是否还站得住">
          <ResumeJDDifferencePanel
            applicationId={applicationId}
            run={run(crowded)}
            facts={facts}
          />
        </State>

        <State
          name="差异分析 · 超长原文"
          note="单条 JD 原文 350+ 字符，行内截断两行，全文在展开面板"
        >
          <ResumeJDDifferencePanel
            applicationId={applicationId}
            run={run(
              output({
                issues: [
                  issue("long", "critical", {
                    jdOriginal: longJd,
                    jdTranslationZh:
                      "这个岗位要求在三个市场同时主导产品探索，并对领导层定期汇报，同时德语 C1 是硬性门槛。",
                  }),
                ],
              }),
            )}
            facts={facts}
          />
        </State>

        <State name="差异分析 · 已过期" note="材料变了，旧结论仍可查看">
          <ResumeJDDifferencePanel
            applicationId={applicationId}
            run={run(output())}
            facts={facts}
            stale
          />
        </State>
      </div>
    </main>
  );
}
