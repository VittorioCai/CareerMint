# 岗位与简历差异工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一次用户主动触发、一次模型调用，准确诊断当前 JD 与所选简历之间的表达、证据和资格差异，并用同一份结果驱动独立的“差异分析”和“完善建议”页面。

**Architecture:** 新建独立的 `resume-jd-difference-v4` 功能域，不修改或复用 V3 的两阶段分析状态。服务端先解析当前 JD、所选简历和已确认职业事实，构造稳定输入哈希，再由 Provider 一次性返回岗位核心判断、全部差异和完善方向；确定性策略层回查引用、事实所有权、严格资格和禁止代写规则，只有整份结果合法时才原子发布。数据库用单张运行表保存经过校验的组合 JSON 结果，两个页面读取同一个 run；旧 V3 数据只保留为历史，不进入新主流程。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5、Zod 4、Supabase/PostgreSQL/RLS/pgTAP、DeepSeek JSON 输出、Vitest/Testing Library、Playwright、现有 PDF/DOCX/OCR 解析链路。

---

## 实施边界与文件地图

本计划以已确认规格 `docs/superpowers/specs/2026-08-27-resume-jd-difference-workflow-design.md` 为唯一产品依据。

新建文件：

- `src/features/resume-jd-difference/schemas.ts`
- `src/features/resume-jd-difference/schemas.test.ts`
- `src/features/resume-jd-difference/prompts.ts`
- `src/features/resume-jd-difference/prompts.test.ts`
- `src/features/resume-jd-difference/hashes.ts`
- `src/features/resume-jd-difference/hashes.test.ts`
- `src/features/resume-jd-difference/policy.ts`
- `src/features/resume-jd-difference/policy.test.ts`
- `src/features/resume-jd-difference/repository.ts`
- `src/features/resume-jd-difference/repository.test.ts`
- `src/features/resume-jd-difference/service.ts`
- `src/features/resume-jd-difference/service.test.ts`
- `src/features/resume-jd-difference/http.ts`
- `src/features/resume-jd-difference/http.test.ts`
- `src/features/resume-jd-difference/analysis-control.tsx`
- `src/features/resume-jd-difference/analysis-control.test.tsx`
- `src/features/resume-jd-difference/difference-panel.tsx`
- `src/features/resume-jd-difference/difference-panel.test.tsx`
- `src/features/resume-jd-difference/improvement-panel.tsx`
- `src/features/resume-jd-difference/improvement-panel.test.tsx`
- `src/features/resume-jd-difference/markdown.ts`
- `src/features/resume-jd-difference/markdown.test.ts`
- `src/features/resume-jd-difference/evaluation.ts`
- `src/features/resume-jd-difference/evaluation.test.ts`
- `src/app/api/applications/[id]/resume-jd-difference/analyze/route.ts`
- `src/app/api/applications/[id]/resume-jd-difference/analyze/route.test.ts`
- `src/app/api/applications/[id]/resume-jd-difference/export/route.ts`
- `src/app/api/applications/[id]/resume-jd-difference/export/route.test.ts`
- `supabase/migrations/202608270002_resume_jd_difference_v4.sql`
- `supabase/tests/database/resume_jd_difference_v4_rls.test.sql`
- `scripts/evaluate-resume-jd-difference-prompts.ts`
- `tests/e2e/resume-jd-difference-workflow.spec.ts`
- `tests/fixtures/resume-jd-difference-eval/01-en-synonym-alignment.json`
- `tests/fixtures/resume-jd-difference-eval/02-de-strict-gates.json`
- `tests/fixtures/resume-jd-difference-eval/03-en-skill-only.json`
- `tests/fixtures/resume-jd-difference-eval/04-de-profile-only.json`
- `tests/fixtures/resume-jd-difference-eval/05-en-unsupported.json`
- `tests/fixtures/resume-jd-difference-eval/06-en-missing-context-result.json`

修改文件：

- `src/features/extraction/provider.ts`
- `src/features/extraction/provider.test.ts`
- `src/features/extraction/deepseek-extractor.ts`
- `src/features/extraction/deepseek-extractor.test.ts`
- `src/features/applications/detail-tabs.ts`
- `src/features/applications/detail-tabs.test.ts`
- `src/app/(app)/applications/[id]/page.tsx`
- `src/lib/env/server.ts`
- `src/lib/env/server.test.ts`
- `src/features/privacy/export.ts`
- `src/features/privacy/export.test.ts`
- `src/app/api/account/export/route.ts`
- `src/lib/supabase/database.types.ts`
- `package.json`
- `tests/e2e/application-workspace.spec.ts`

保留但不再由新页面引用：

- `src/features/jd-gap-analysis/**`
- `src/app/api/applications/[id]/jd-gap/**`
- `jd_structure_*` 与 `jd_gap_v3_*` 数据库对象

删除原则：本迭代不删除 V3 文件、API 或数据库表，避免破坏历史数据和回滚能力；只从新 UI 主流程断开引用。

---

## Task 1：锁定 V4 领域模型与单次输出契约

**Files:**

- Create: `src/features/resume-jd-difference/schemas.ts`
- Create: `src/features/resume-jd-difference/schemas.test.ts`

- [ ] **Step 1: 先写失败的 Schema 测试**

覆盖以下拒绝条件：未知键、重复 ID、超过 5 个核心能力、没有中文解释、issue 指向不存在的 concept、direction 指向不存在的 issue、完整替换句、`unsupported` 却给出可用岗位语言、门槛项没有 `isGate=true`。

```ts
import { describe, expect, it } from "vitest";
import {
  resumeJDDifferenceOutputSchema,
  validateResumeJDDifferenceGraph,
} from "./schemas";

describe("resume JD difference V4 output", () => {
  it("accepts one atomic graph used by both tabs", () => {
    const parsed = resumeJDDifferenceOutputSchema.parse(validFixture);
    expect(validateResumeJDDifferenceGraph(parsed)).toEqual({ ok: true });
  });

  it("rejects a direction linked to an unknown issue", () => {
    const fixture = structuredClone(validFixture);
    fixture.directions[0].issueId = "issue-missing";
    expect(validateResumeJDDifferenceGraph(fixture)).toEqual({
      ok: false,
      code: "direction-issue-not-found",
    });
  });

  it("rejects paste-ready rewritten resume sentences", () => {
    const fixture = structuredClone(validFixture);
    fixture.directions[0].direction =
      "Collaborated with business stakeholders to align reporting needs and delivered dashboards.";
    expect(validateResumeJDDifferenceGraph(fixture)).toEqual({
      ok: false,
      code: "paste-ready-rewrite-not-allowed",
    });
  });
});
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/schemas.test.ts`

Expected: FAIL，提示 `./schemas` 不存在或导出缺失。

- [ ] **Step 3: 实现严格 Zod 契约和图一致性校验**

核心类型必须固定为：

```ts
export const differenceIssueTypeSchema = z.enum([
  "missing",
  "language_misaligned",
  "profile_only",
  "skill_only",
  "too_vague",
  "missing_context",
  "missing_result",
  "needs_confirmation",
  "gate",
]);

export const authenticitySchema = z.enum([
  "supported",
  "profile_only",
  "needs_confirmation",
  "unsupported",
]);

export const prioritySchema = z.enum(["critical", "important", "minor"]);

export const resumeJDDifferenceOutputSchema = z.object({
  jobCore: z.object({
    mission: z.string().trim().min(1).max(800),
    coreCapabilities: z.array(z.string().trim().min(1).max(240)).min(3).max(5),
    concepts: z.array(jobConceptSchema).min(1).max(24),
    gates: z.array(jobGateSchema).max(16),
    preferredItems: z.array(preferredItemSchema).max(16),
  }).strict(),
  overallDifference: z.object({
    summary: z.string().trim().min(1).max(1_000),
    topIssueIds: z.array(z.string()).min(1).max(3),
  }).strict(),
  issues: z.array(differenceIssueSchema).max(80),
  matched: z.array(matchedItemSchema).max(80),
  directions: z.array(improvementDirectionSchema).max(80),
}).strict();
```

`validateResumeJDDifferenceGraph` 还要检查：所有 ID 唯一、引用存在、profile fact ID 不重复、每个非门槛 issue 至少有一条 direction、`unsupported` 方向只能提示确认或不添加、不得出现第一人称完成句或以强动作动词开头的简历 bullet。

- [ ] **Step 4: 再运行 Schema 测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/schemas.test.ts`

Expected: PASS，全部 V4 输出契约与拒绝案例通过。

- [ ] **Step 5: 提交领域契约**

```bash
git add src/features/resume-jd-difference/schemas.ts src/features/resume-jd-difference/schemas.test.ts
git commit -m "feat: define resume JD difference contract"
```

---

## Task 2：建立岗位重点、真实性和禁止代写策略

**Files:**

- Create: `src/features/resume-jd-difference/prompts.ts`
- Create: `src/features/resume-jd-difference/prompts.test.ts`
- Create: `src/features/resume-jd-difference/policy.ts`
- Create: `src/features/resume-jd-difference/policy.test.ts`

- [ ] **Step 1: 写 Prompt 内容和策略红灯测试**

测试必须断言 Prompt 明确包含：一次调用、完整 JSON、先做岗位核心判断、词频不是唯一信号、职责可做同义语义对齐、工具/年限/语言/学历/证书/许可严格匹配、`当前材料未找到相关证据`、禁止改写句、禁止虚构、只用 confirmed facts。

策略测试覆盖：

```ts
it.each([
  ["AWS", "Azure"],
  ["German C1", "German B2"],
  ["five years", "three years"],
  ["work authorization", "visa interest"],
])("does not treat strict values as synonyms", (jd, resume) => {
  expect(isStrictlyEquivalent(jd, resume)).toBe(false);
});

it("allows a supported responsibility-language alignment", () => {
  expect(classifySemanticAlignment({
    jdTerm: "stakeholder management",
    resumeExcerpt: "gathered reporting needs from business teams and presented findings",
    strictKind: null,
  })).toBe("candidate-semantic-alignment");
});
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/prompts.test.ts src/features/resume-jd-difference/policy.test.ts`

Expected: FAIL，Prompt/策略模块尚不存在。

- [ ] **Step 3: 实现版本常量和候选 Prompt**

```ts
export const RESUME_JD_DIFFERENCE_SCHEMA_VERSION = "resume-jd-difference-v4";
export const RESUME_JD_DIFFERENCE_POLICY_VERSION = "resume-jd-difference-policy-v4.0";

export const differencePromptVariants = {
  p1: { version: "resume-jd-difference-p1-v4.0", instructions: p1Instructions },
  p2: { version: "resume-jd-difference-p2-v4.0", instructions: p2Instructions },
  p3: { version: "resume-jd-difference-p3-v4.0", instructions: p3Instructions },
} as const;

export type DifferencePromptVariant = keyof typeof differencePromptVariants;
```

三版只允许在分析顺序和少量示例上变化，安全边界、Schema 和输出语言保持相同，便于公平评测。固定系统提示词放前面，用户材料放 XML 分隔块中。

- [ ] **Step 4: 实现确定性策略层**

实现并导出：

- `STRICT_KINDS`：tool/framework/cloud/method/years/language/degree_level/certificate/license/work_authorization/management_scope/number/result；
- `findExactExcerpt`：规范化空白后仍要求原文连续回查；
- `verifyFactIds`：只接受当前用户的 confirmed fact ID；
- `downgradeInvalidEvidence`：无效引用删除后降级为 `needs_confirmation` 或 `unsupported`；
- `rejectPasteReadyRewrite`：阻止完整英文或德文简历 bullet；
- `sortIssues`：gate 单列，其他按 critical → important → minor，matched 最后。

- [ ] **Step 5: 运行策略测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/prompts.test.ts src/features/resume-jd-difference/policy.test.ts`

Expected: PASS，不把相邻工具或资格当同义词，受证据支持的职责语言可进入候选对齐。

- [ ] **Step 6: 提交 Prompt 与策略**

```bash
git add src/features/resume-jd-difference/prompts.ts src/features/resume-jd-difference/prompts.test.ts src/features/resume-jd-difference/policy.ts src/features/resume-jd-difference/policy.test.ts
git commit -m "feat: add grounded difference analysis policy"
```

---

## Task 3：建立稳定输入哈希和过期判定

**Files:**

- Create: `src/features/resume-jd-difference/hashes.ts`
- Create: `src/features/resume-jd-difference/hashes.test.ts`

- [ ] **Step 1: 写哈希红灯测试**

覆盖：事实顺序变化不改变哈希；JD、简历文件哈希、已确认事实内容、Provider、模型、Prompt、Schema、Policy 任一变化都会改变 `inputHash`；pending/rejected facts 不进入指纹；不把文件名作为内容标识。

```ts
expect(buildDifferenceInputHash(baseInput)).toBe(
  buildDifferenceInputHash({ ...baseInput, confirmedFacts: [...baseInput.confirmedFacts].reverse() }),
);
expect(buildDifferenceInputHash({ ...baseInput, sourceSha256: "b".repeat(64) }))
  .not.toBe(buildDifferenceInputHash(baseInput));
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/hashes.test.ts`

Expected: FAIL，哈希实现尚不存在。

- [ ] **Step 3: 实现规范化与 SHA-256**

```ts
export type DifferenceHashInput = {
  jdText: string;
  sourceSha256: string;
  confirmedFacts: ConfirmedFactForAnalysis[];
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  policyVersion: string;
};

export function buildDifferenceFingerprints(input: DifferenceHashInput) {
  const jdSha256 = sha256(normalizeDocumentText(input.jdText));
  const factFingerprint = sha256(stableStringify(normalizeConfirmedFacts(input.confirmedFacts)));
  const inputHash = sha256(stableStringify({
    jdSha256,
    sourceSha256: input.sourceSha256,
    factFingerprint,
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    policyVersion: input.policyVersion,
  }));
  return { jdSha256, factFingerprint, inputHash };
}
```

- [ ] **Step 4: 运行测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/hashes.test.ts`

Expected: PASS，缓存键和过期判定对所有已确认输入敏感且对无意义顺序稳定。

- [ ] **Step 5: 提交哈希层**

```bash
git add src/features/resume-jd-difference/hashes.ts src/features/resume-jd-difference/hashes.test.ts
git commit -m "feat: fingerprint resume JD difference inputs"
```

---

## Task 4：把 Provider 改成真正的一次模型调用

**Files:**

- Modify: `src/features/extraction/provider.ts`
- Modify: `src/features/extraction/provider.test.ts`
- Modify: `src/features/extraction/deepseek-extractor.ts`
- Modify: `src/features/extraction/deepseek-extractor.test.ts`

- [ ] **Step 1: 写 Provider 红灯测试**

新增的唯一接口：

```ts
analyzeResumeJDDifference(
  input: ResumeJDDifferenceInput,
  options: { promptVariant: DifferencePromptVariant },
): Promise<AIResult<ResumeJDDifferenceOutput>>;
```

测试断言一次方法调用只产生一次 `runAttempt` 请求，用户内容包含三个且仅三个材料区块：`job_description`、`selected_resume`、`confirmed_career_facts`；输出 Schema 是组合 V4 Schema；`maxTokens` 不超过 8192；格式错误直接作为本次运行失败返回，不做自动 Provider 重试，避免一次点击产生第二次计费调用。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/extraction/provider.test.ts src/features/extraction/deepseek-extractor.test.ts`

Expected: FAIL，`analyzeResumeJDDifference` 尚未定义。

- [ ] **Step 3: 扩展 `AIProvider`**

```ts
import type {
  DifferencePromptVariant,
} from "@/features/resume-jd-difference/prompts";
import type {
  ResumeJDDifferenceInput,
  ResumeJDDifferenceOutput,
} from "@/features/resume-jd-difference/schemas";

// 保留旧 V3 方法用于历史 API；新增：
analyzeResumeJDDifference(
  input: ResumeJDDifferenceInput,
  options: { promptVariant: DifferencePromptVariant },
): Promise<AIResult<ResumeJDDifferenceOutput>>;
```

- [ ] **Step 4: 在 DeepSeek 适配器中实现组合请求**

```ts
async analyzeResumeJDDifference(input, options) {
  const prompt = differencePromptVariants[options.promptVariant];
  return runAttempt({
    systemInstructions: prompt.instructions,
    userContent: [
      `<job_description>\n${input.jdText}\n</job_description>`,
      `<selected_resume>\n${input.resumeText}\n</selected_resume>`,
      `<confirmed_career_facts>\n${JSON.stringify(input.confirmedFacts)}\n</confirmed_career_facts>`,
    ].join("\n"),
    outputSchema: resumeJDDifferenceOutputSchema,
    invalidOutputError: "resume-jd-difference-invalid-output",
    maxTokens: 8192,
  });
}
```

- [ ] **Step 5: 运行 Provider 测试并确认绿灯**

Run: `pnpm vitest run src/features/extraction/provider.test.ts src/features/extraction/deepseek-extractor.test.ts`

Expected: PASS，V4 只暴露一个组合分析调用，旧 Provider 能力仍通过回归测试。

- [ ] **Step 6: 提交 Provider 适配**

```bash
git add src/features/extraction/provider.ts src/features/extraction/provider.test.ts src/features/extraction/deepseek-extractor.ts src/features/extraction/deepseek-extractor.test.ts
git commit -m "feat: add one-call resume JD difference provider"
```

---

## Task 5：建立原子结果表、缓存 RPC 与 RLS

**Files:**

- Create: `supabase/migrations/202608270002_resume_jd_difference_v4.sql`
- Create: `supabase/tests/database/resume_jd_difference_v4_rls.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: 先写 pgTAP 红灯测试**

测试两个用户、两份简历、两个申请，覆盖：跨用户不可见；authenticated 不能直接 insert/update/delete；`create_or_get_resume_jd_difference` 只接受自己的 application 和 selected asset；同一 `input_hash` 复用；版本冲突拒绝；queued 可 claim；fresh running 不可重复 claim；stale running 可 fencing reclaim；旧 attempt 不可 complete；非法 result 不发布；成功一次性保存整个 JSON；失败保留旧成功；删除申请级联清理 run；删除 source asset 前有引用时由应用流程解除或数据库拒绝。

- [ ] **Step 2: 运行数据库测试并确认红灯**

Run: `pnpm db:reset && pnpm test:db`

Expected: FAIL，`resume_jd_difference_runs` 与 RPC 尚不存在。

- [ ] **Step 3: 新建单表原子运行模型**

核心 DDL：

```sql
create table public.resume_jd_difference_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_asset_id uuid not null references public.source_assets(id) on delete restrict,
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  jd_sha256 text not null check (jd_sha256 ~ '^[0-9a-f]{64}$'),
  fact_fingerprint text not null check (fact_fingerprint ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  provider text not null,
  model text not null,
  schema_version text not null,
  prompt_version text not null,
  policy_version text not null,
  status public.ai_run_status not null default 'queued',
  attempt_count integer not null default 0,
  result jsonb,
  ai_usage jsonb,
  estimated_cost_usd numeric,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, input_hash),
  check ((status = 'succeeded') = (result is not null)),
  check (result is null or jsonb_typeof(result) = 'object')
);
```

不要为 issues/directions 再建子表：两个页面必须读取同一个不可拆分 JSON，避免出现一页成功、一页缺数据。

- [ ] **Step 4: 实现 SECURITY DEFINER RPC 和授权**

实现：

- `create_or_get_resume_jd_difference(...) returns resume_jd_difference_runs`
- `claim_resume_jd_difference(target_run_id, expected_attempt_count, expected_status, stale_after_seconds) returns boolean`
- `complete_resume_jd_difference(target_run_id, expected_attempt_count, result, ai_usage, estimated_cost_usd) returns resume_jd_difference_runs`
- `fail_resume_jd_difference(target_run_id, expected_attempt_count, error_code, error_message) returns resume_jd_difference_runs`

所有 RPC 先用 `auth.uid()` 验证 application、asset、application.resume_source_asset_id 与 user_id 一致；`complete` 只做最小 SQL 形状校验，完整业务 Schema 由 TypeScript 在 RPC 前验证；撤销 public 权限，只授予 authenticated。

- [ ] **Step 5: 开启 owner-only RLS 并验证级联**

表启用 RLS，只允许 owner select；不创建 authenticated insert/update/delete policy。为 `(user_id, application_id, created_at desc)` 和 `(user_id, input_hash)` 建索引。

- [ ] **Step 6: 重新生成类型并运行数据库测试**

Run:

```bash
pnpm db:reset
pnpm test:db
pnpm db:types
pnpm typecheck
```

Expected: pgTAP 全部 PASS；生成类型包含 `resume_jd_difference_runs` 和四个 RPC；TypeScript 无错误。

- [ ] **Step 7: 提交数据库原子运行层**

```bash
git add supabase/migrations/202608270002_resume_jd_difference_v4.sql supabase/tests/database/resume_jd_difference_v4_rls.test.sql src/lib/supabase/database.types.ts
git commit -m "feat: persist atomic resume JD difference runs"
```

---

## Task 6：实现 Repository 的当前结果、历史结果与过期状态

**Files:**

- Create: `src/features/resume-jd-difference/repository.ts`
- Create: `src/features/resume-jd-difference/repository.test.ts`

- [ ] **Step 1: 写 Repository 红灯测试**

测试接口：

```ts
type DifferenceRunView = {
  current: ResumeJDDifferenceRun | null;
  previousSucceeded: ResumeJDDifferenceRun | null;
  freshness: "current" | "stale" | "missing";
};
```

覆盖：最新 succeeded 且 inputHash 相同为 current；最新 running 时旧成功只进入 previous；输入变化时成功结果标 stale；failed 不覆盖 previous；跨用户查询 `.eq("user_id", userId)`；解析数据库 JSON 时再次走 Zod。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/repository.test.ts`

Expected: FAIL，Repository 尚不存在。

- [ ] **Step 3: 实现数据库映射与运行接口**

Repository 固定导出：

```ts
export const resumeJDDifferenceRepository = {
  getLatest,
  getLatestSucceeded,
  getById,
  getByInputHash,
  createOrGet,
  claim,
  complete,
  fail,
  getView,
};
```

`getView(userId, applicationId, expectedInputHash)` 必须返回当前运行与旧成功两条独立引用，禁止用旧成功伪装 current。

- [ ] **Step 4: 运行测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/repository.test.ts`

Expected: PASS，当前、过期、处理中、失败和历史结果边界清楚。

- [ ] **Step 5: 提交 Repository**

```bash
git add src/features/resume-jd-difference/repository.ts src/features/resume-jd-difference/repository.test.ts
git commit -m "feat: add resume JD difference run repository"
```

---

## Task 7：实现一次调用的分析 Service 和确定性发布闸门

**Files:**

- Create: `src/features/resume-jd-difference/service.ts`
- Create: `src/features/resume-jd-difference/service.test.ts`

- [ ] **Step 1: 写 Service 红灯测试**

至少覆盖：

1. 相同 inputHash 的 succeeded run 直接复用，Provider 0 次调用；
2. 新输入只调用 `analyzeResumeJDDifference` 1 次；
3. 只把 confirmed facts 传给模型；
4. 用现有 `downloadSource` + `extractResumeText` 解析所选资源；
5. 空文本或解析失败在调用模型前失败；
6. 输出中的 JD/简历 excerpt 必须能回查；
7. 未确认或属于其他用户的 fact ID 被移除并降级；
8. strict trap 不可语义升级；
9. directions 出现改写句时整次失败，不发布半份结果；
10. 成功保存 token/估算费用；日志只含 runId、版本、token、错误码，不含正文。

关键断言：

```ts
expect(provider.analyzeResumeJDDifference).toHaveBeenCalledTimes(1);
expect(repository.complete).toHaveBeenCalledTimes(1);
expect(repository.complete).toHaveBeenCalledWith(expect.objectContaining({
  result: expect.objectContaining({
    jobCore: expect.any(Object),
    issues: expect.any(Array),
    directions: expect.any(Array),
  }),
}));
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/service.test.ts`

Expected: FAIL，Service 尚不存在。

- [ ] **Step 3: 实现分析编排**

```ts
export async function runResumeJDDifference(input: RunDifferenceInput) {
  const resumeBuffer = await storage.download(input.asset.storagePath);
  const resumeText = await parser(resumeBuffer, input.asset.contentType);
  if (normalizeDocumentText(resumeText).length < 80) {
    throw new DifferenceError("resume-text-insufficient");
  }

  const fingerprints = buildDifferenceFingerprints(/* exact current inputs */);
  const run = await runs.createOrGet(/* metadata + fingerprints */);
  if (run.status === "succeeded") return { run, reused: true };
  if (!await runs.claim(run.id, run.attemptCount, run.status)) {
    return { run: await runs.getById(input.userId, run.id), reused: true };
  }

  const ai = await provider.analyzeResumeJDDifference({
    jdText: input.jdText,
    resumeText,
    confirmedFacts: input.confirmedFacts,
  }, { promptVariant: input.promptVariant });

  const verified = verifyAndNormalizeDifferenceOutput(ai.data, {
    jdText: input.jdText,
    resumeText,
    confirmedFacts: input.confirmedFacts,
  });
  return runs.complete(/* one atomic result */);
}
```

解析失败沿用当前客户端 OCR 工作流：服务返回稳定错误码 `resume-text-insufficient` 或 `resume-parse-failed`，UI 引导回到简历页预览/重传；不在分析服务内引入远程 OCR 或第二次 AI 调用。

- [ ] **Step 4: 实现异常映射和发布闸门**

Provider timeout → `ai-timeout`；429 → `ai-rate-limited`；非法 JSON → `resume-jd-difference-invalid-output`；引用校验失败 → `resume-jd-difference-evidence-invalid`。任一错误调用 `runs.fail`，绝不调用 `complete`。

- [ ] **Step 5: 运行 Service 测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/service.test.ts`

Expected: PASS，单次调用、缓存、解析、校验和原子发布全部成立。

- [ ] **Step 6: 提交 Service**

```bash
git add src/features/resume-jd-difference/service.ts src/features/resume-jd-difference/service.test.ts
git commit -m "feat: run one-call grounded difference analysis"
```

---

## Task 8：实现单 POST HTTP API、重复点击去重与稳定错误

**Files:**

- Create: `src/features/resume-jd-difference/http.ts`
- Create: `src/features/resume-jd-difference/http.test.ts`
- Create: `src/app/api/applications/[id]/resume-jd-difference/analyze/route.ts`
- Create: `src/app/api/applications/[id]/resume-jd-difference/analyze/route.test.ts`
- Modify: `src/lib/env/server.ts`
- Modify: `src/lib/env/server.test.ts`

- [ ] **Step 1: 写 HTTP 红灯测试**

覆盖 401、404、未同意 AI、未选简历、资源不属于用户、资源不是 application 当前选择、成功、缓存复用、处理中 202、失败稳定错误码。成功只响应一次，不再返回 V3 的 `nextPhase`。

```ts
type DifferenceAnalyzeResponse = {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  reused: boolean;
  freshness: "current" | "stale" | "missing";
  errorCode: string | null;
};
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/http.test.ts 'src/app/api/applications/[id]/resume-jd-difference/analyze/route.test.ts'`

Expected: FAIL，新 API 尚不存在。

- [ ] **Step 3: 实现依赖注入 Handler**

`createResumeJDDifferencePostHandler` 只完成鉴权、输入装配、调用 service 和错误映射。Route 注入：

- `applicationRepository.get`
- `getOwnedAsset`
- `listConfirmedFactsForAnalysis`
- `getAIProcessingConsentAt`
- `downloadSource`
- `extractResumeText`
- `createDeepSeekAIProvider`
- `resumeJDDifferenceRepository`
- 现有 AI price schedule

- [ ] **Step 4: 配置 Prompt 选择且保持可评测**

在 `src/lib/env/server.ts` 新增：

```ts
RESUME_JD_DIFFERENCE_PROMPT_VARIANT: z.enum(["p1", "p2", "p3"]).default("p1"),
```

保留 `JD_GAP_MATCH_PROMPT_VARIANT` 给旧 API；新 Route 只读新变量。测试非法值会明确抛出变量名。

- [ ] **Step 5: 实现非生产 fake Provider**

只有 `E2E_FAKE_EXTRACTOR=1 && NODE_ENV !== "production"` 时启用；固定输出必须同时包含 jobCore、issues、matched、directions，以便 E2E 验证一次响应驱动两页。

- [ ] **Step 6: 运行 HTTP 与环境测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/http.test.ts 'src/app/api/applications/[id]/resume-jd-difference/analyze/route.test.ts' src/lib/env/server.test.ts`

Expected: PASS，网络层只有一个 POST 和一个组合状态。

- [ ] **Step 7: 提交 API**

```bash
git add src/features/resume-jd-difference/http.ts src/features/resume-jd-difference/http.test.ts 'src/app/api/applications/[id]/resume-jd-difference/analyze/route.ts' 'src/app/api/applications/[id]/resume-jd-difference/analyze/route.test.ts' src/lib/env/server.ts src/lib/env/server.test.ts
git commit -m "feat: expose single-step difference analysis API"
```

---

## Task 9：实现差异分析交互和完整诊断视图

**Files:**

- Create: `src/features/resume-jd-difference/analysis-control.tsx`
- Create: `src/features/resume-jd-difference/analysis-control.test.tsx`
- Create: `src/features/resume-jd-difference/difference-panel.tsx`
- Create: `src/features/resume-jd-difference/difference-panel.test.tsx`

- [ ] **Step 1: 写 Control 红灯测试**

覆盖：未选简历只显示“先选择对照简历”；idle 显示“开始差异分析”；succeeded 显示“重新分析”；点击只发一个 POST；处理中禁用重复点击；成功 `router.refresh()`；失败保留旧结果入口；不自动请求。

- [ ] **Step 2: 写差异面板红灯测试**

断言页面顺序与文案：

1. `本次对照简历`
2. `岗位核心判断`
3. `这份简历的总体差异`
4. `具体差异`
5. `岗位门槛待确认`
6. `已经对上的内容`
7. `下一步：查看完善建议`

每条展开项必须同时展示 `JD 原文`、`中文解释`、`简历现状`、`问题点`、`判断依据`、`优先级`；不出现“你不具备”；无证据统一为 `当前材料未找到相关证据`；matched 默认折叠；top issues 最多三条；全部 issues 可访问。

- [ ] **Step 3: 运行组件测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/analysis-control.test.tsx src/features/resume-jd-difference/difference-panel.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 4: 实现 Control 状态机**

状态固定为 `idle | submitting | running | succeeded | failed | stale`。一次点击发一次 POST；202 时展示“正在分析岗位与简历差异”，通过用户刷新或已有页面刷新机制读取状态，不启动第二阶段 POST。当前运行中默认隐藏旧结果，仅显示按钮“查看上次结果”。

- [ ] **Step 5: 实现可访问的差异视图**

使用原生 `<details><summary>` 保证键盘可用；状态 Chip 同时包含文字和符号，不只依赖颜色；桌面单列为主，避免 V3 信息密度；移动端正文不横向溢出。严格将门槛 issue 从普通 issue 列表中分离。

- [ ] **Step 6: 运行组件测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/analysis-control.test.tsx src/features/resume-jd-difference/difference-panel.test.tsx`

Expected: PASS，页面先总体、后分点，全部差异存在，已匹配项在底部折叠。

- [ ] **Step 7: 提交差异分析 UI**

```bash
git add src/features/resume-jd-difference/analysis-control.tsx src/features/resume-jd-difference/analysis-control.test.tsx src/features/resume-jd-difference/difference-panel.tsx src/features/resume-jd-difference/difference-panel.test.tsx
git commit -m "feat: render complete resume JD differences"
```

---

## Task 10：实现独立“完善建议”页面且绝不代写

**Files:**

- Create: `src/features/resume-jd-difference/improvement-panel.tsx`
- Create: `src/features/resume-jd-difference/improvement-panel.test.tsx`

- [ ] **Step 1: 写完善建议红灯测试**

覆盖五类分组：`岗位语言未对齐`、`经历证据需要加强`、`关键词位置较弱`、`需要本人确认`、`不能通过改简历解决`。每条显示关联问题、目标简历位置、岗位原词/概念、动作/场景/协作对象/方法/结果等完善重点、真实性状态和方向说明。

负面断言：不显示 accept/reject；不显示自动修改；不包含完整替换句；未分析时只显示“请先完成差异分析”；stale 时显示“材料已变化，请重新分析”；页面打开不触发 API。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/improvement-panel.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现从同一个 run 派生分组**

```ts
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
```

`unsupported` 的说明固定包含“如未实际做过，请不要加入简历”；`profile_only` 显示职业档案来源但不自动写入；`supported` 才显示可参考的同义岗位语言。

- [ ] **Step 4: 运行测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/improvement-panel.test.tsx`

Expected: PASS，完善建议与差异问题逐条关联且不生成替换文本。

- [ ] **Step 5: 提交完善建议 UI**

```bash
git add src/features/resume-jd-difference/improvement-panel.tsx src/features/resume-jd-difference/improvement-panel.test.tsx
git commit -m "feat: add grounded improvement directions tab"
```

---

## Task 11：接入申请详情软性工作流并断开 V3 主界面

**Files:**

- Modify: `src/features/applications/detail-tabs.ts`
- Create: `src/features/applications/detail-tabs.test.ts`
- Modify: `src/app/(app)/applications/[id]/page.tsx`
- Modify: `tests/e2e/application-workspace.spec.ts`

- [ ] **Step 1: 写导航与服务端页面红灯断言**

将 detail tabs 固定为：

```ts
export const applicationDetailTabs = [
  { id: "overview", label: "概览" },
  { id: "resume", label: "简历" },
  { id: "difference", label: "差异分析" },
  { id: "improvements", label: "完善建议" },
  { id: "interview", label: "面试准备" },
  { id: "timeline", label: "时间线" },
] as const;
```

`detail-tabs.test.ts` 先断言上述准确顺序和中文标签。页面静态检查确保不再 import `JDGapAnalysisControl`、`JDGapAnalysisPanel`、`jdGapV3Repository`、`jdStructureRepository`；旧 `?tab=jd` 重定向或兼容解析为 `difference`，避免已保存链接失效。

- [ ] **Step 2: 运行相关测试并确认红灯**

Run: `pnpm vitest run src/features/applications/detail-tabs.test.ts`

Expected: FAIL，标签仍为 `JD`，页面仍接入 V3。

- [ ] **Step 3: 重构服务器端数据装配**

当 activeTab 是 `difference` 或 `improvements` 时：

1. 加载 `listAssets(user.id)` 并定位 application 当前 selected asset；
2. 加载 confirmed facts，仅用于计算当前 expectedInputHash，不传到客户端全文；
3. 用当前 provider/model/prompt/schema/policy 计算 expected hash；
4. 调用 `resumeJDDifferenceRepository.getView`；
5. difference 渲染 Control + DifferencePanel；
6. improvements 只渲染 ImprovementPanel；
7. 未选简历时不读取 run，也不调用 AI。

页面主标题固定为 `岗位与简历差异分析`，说明固定为 `找出这份简历尚未覆盖、表达不清或无法证明的岗位重点。`

- [ ] **Step 4: 实现软性导航和旧链接兼容**

- 简历页已有预览与选择流程保持不变；
- difference 无简历时链接回 `?tab=resume`；
- difference 成功后链接到 `?tab=improvements`；
- improvements 无结果时链接到 `?tab=difference`；
- improvements 底部链接到 `?tab=interview`；
- 不禁用任何标签。

- [ ] **Step 5: 清理旧 E2E 中两次 POST 的假设**

从 `tests/e2e/application-workspace.spec.ts` 移除 `AdvanceBody`、`clickAndCollectGapAdvance(..., expectedCount = 2)` 和 V3 专属 summary 断言；保留简历选择、预览、删除投递等与新工作流无冲突的覆盖。新工作流完整覆盖移到 Task 14 的独立 E2E。

- [ ] **Step 6: 运行单元与类型测试**

Run:

```bash
pnpm vitest run src/features/applications src/features/resume-jd-difference
pnpm typecheck
```

Expected: PASS；申请详情无 V3 import；tab 顺序和软性跳转符合规格。

- [ ] **Step 7: 提交页面工作流**

```bash
git add src/features/applications/detail-tabs.ts src/features/applications/detail-tabs.test.ts 'src/app/(app)/applications/[id]/page.tsx' tests/e2e/application-workspace.spec.ts
git commit -m "feat: wire resume difference improvement workflow"
```

---

## Task 12：保留安全的 Markdown 导出与账户数据导出

**Files:**

- Create: `src/features/resume-jd-difference/markdown.ts`
- Create: `src/features/resume-jd-difference/markdown.test.ts`
- Create: `src/app/api/applications/[id]/resume-jd-difference/export/route.ts`
- Create: `src/app/api/applications/[id]/resume-jd-difference/export/route.test.ts`
- Modify: `src/features/privacy/export.ts`
- Modify: `src/features/privacy/export.test.ts`
- Modify: `src/app/api/account/export/route.ts`

- [ ] **Step 1: 写 Markdown 与隐私红灯测试**

Markdown 依次导出：岗位核心判断、总体差异、全部具体差异、岗位门槛、完善方向、已匹配内容。包含 JD 原文与中文、简历引用与真实性状态；转义标题、文件名和用户文本；不包含 inputHash、sourceSha256、factFingerprint、内部错误、完整简历/JD 或原始模型响应。

账户导出允许包含用户自己的 V4 `result` 和公开运行元数据，但排除内部哈希、错误详情和请求 ID。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/markdown.test.ts 'src/app/api/applications/[id]/resume-jd-difference/export/route.test.ts' src/features/privacy/export.test.ts`

Expected: FAIL，新导出尚不存在。

- [ ] **Step 3: 实现纯函数 Markdown 生成器**

文件名使用 `company-role-difference-analysis.md` 的安全 slug；响应头使用 RFC 5987 编码；只允许导出当前用户拥有的 succeeded run。过期 run 允许用户明确从“查看上次结果”中导出，但文档顶部标记“此结果可能已过期”。

- [ ] **Step 4: 扩展账户导出选择字段**

```ts
export const RESUME_JD_DIFFERENCE_EXPORT_SELECT =
  "id,application_id,source_asset_id,source_filename,provider,model,schema_version,prompt_version,policy_version,status,result,ai_usage,estimated_cost_usd,completed_at,created_at";
```

Route 新增 owner-scoped query，并把结果放入 `resumeJDDifferenceRuns`。

- [ ] **Step 5: 运行导出测试并确认绿灯**

Run: `pnpm vitest run src/features/resume-jd-difference/markdown.test.ts 'src/app/api/applications/[id]/resume-jd-difference/export/route.test.ts' src/features/privacy/export.test.ts`

Expected: PASS，用户可整理差异，但隐私元数据不泄露。

- [ ] **Step 6: 提交导出**

```bash
git add src/features/resume-jd-difference/markdown.ts src/features/resume-jd-difference/markdown.test.ts 'src/app/api/applications/[id]/resume-jd-difference/export/route.ts' 'src/app/api/applications/[id]/resume-jd-difference/export/route.test.ts' src/features/privacy/export.ts src/features/privacy/export.test.ts src/app/api/account/export/route.ts
git commit -m "feat: export grounded difference analysis"
```

---

## Task 13：建立精简 Prompt 对比并选出默认版本

**Files:**

- Create: `src/features/resume-jd-difference/evaluation.ts`
- Create: `src/features/resume-jd-difference/evaluation.test.ts`
- Create: `scripts/evaluate-resume-jd-difference-prompts.ts`
- Create: `tests/fixtures/resume-jd-difference-eval/01-en-synonym-alignment.json`
- Create: `tests/fixtures/resume-jd-difference-eval/02-de-strict-gates.json`
- Create: `tests/fixtures/resume-jd-difference-eval/03-en-skill-only.json`
- Create: `tests/fixtures/resume-jd-difference-eval/04-de-profile-only.json`
- Create: `tests/fixtures/resume-jd-difference-eval/05-en-unsupported.json`
- Create: `tests/fixtures/resume-jd-difference-eval/06-en-missing-context-result.json`
- Modify: `package.json`
- Modify: `src/lib/env/server.ts`
- Modify: `src/lib/env/server.test.ts`

- [ ] **Step 1: 写评测器红灯测试**

评测硬指标：核心问题召回、虚假语义对齐、无证据误报、类型准确、优先级合理、direction 关联完整、Schema 合法率、改写句数量、虚构事实数量。Prompt 只有在 `pasteReadyRewriteCount=0`、`fabricatedFactCount=0`、`schemaValidRate=1` 时才有资格获胜。

费用闸门固定：6 fixtures × 3 prompts = 18 次最大调用；默认预算上限 1 USD；单次输出上限 4096 tokens；运行前打印预计最大调用数，超限立即退出。

- [ ] **Step 2: 运行评测单元测试并确认红灯**

Run: `pnpm vitest run src/features/resume-jd-difference/evaluation.test.ts`

Expected: FAIL，评测器尚不存在。

- [ ] **Step 3: 实现匿名 fixture 与确定性评分**

每个 fixture 提供 JD、resume、confirmedFacts、expected issue 类型/关键词/strict traps/不得出现内容。不得包含真实姓名、邮箱、公司内部信息或完整用户简历。

- [ ] **Step 4: 实现脚本和 package 命令**

```json
"eval:resume-jd-difference": "tsx scripts/evaluate-resume-jd-difference-prompts.ts"
```

脚本支持 `--dry-run`、`--prompts=p1,p2,p3`、`--max-cost-usd=1`，输出每版 JSON 与 Markdown 汇总，不写入 git 追踪目录。

- [ ] **Step 5: 运行免费 dry-run 和评测器测试**

Run:

```bash
pnpm eval:resume-jd-difference --dry-run
pnpm vitest run src/features/resume-jd-difference/evaluation.test.ts
```

Expected: dry-run 显示 18 次最大调用、预算上限和 6 个匿名 fixture；单元测试 PASS；不调用真实 API。

- [ ] **Step 6: 在用户已配置 API key 的本地环境运行一次精简真实评测**

Run: `pnpm eval:resume-jd-difference --prompts=p1,p2,p3 --max-cost-usd=1`

Expected: 18 次以内完成；任何安全硬指标失败的 Prompt 自动淘汰；输出获胜 Prompt 和实际 token/估算费用。若全部淘汰，不更改默认值，修 Prompt 后重新评测。

- [ ] **Step 7: 把获胜版本写入默认环境枚举并固定回归 fixture**

只有评测结果产生合格赢家后，把 `RESUME_JD_DIFFERENCE_PROMPT_VARIANT` 的 `.default(...)` 改为赢家，并在 `prompts.test.ts` 固定对应版本号；不把真实输出正文提交到仓库。

- [ ] **Step 8: 提交评测工具和获胜配置**

```bash
git add src/features/resume-jd-difference/evaluation.ts src/features/resume-jd-difference/evaluation.test.ts scripts/evaluate-resume-jd-difference-prompts.ts tests/fixtures/resume-jd-difference-eval package.json src/lib/env/server.ts src/lib/env/server.test.ts
git commit -m "test: evaluate resume JD difference prompts"
```

---

## Task 14：完成端到端工作流、OCR 回归和响应式验收

**Files:**

- Create: `tests/e2e/resume-jd-difference-workflow.spec.ts`
- Modify: `tests/e2e/application-workspace.spec.ts`

- [ ] **Step 1: 写一条完整 fake-provider E2E**

场景：新用户 → 建立申请 → 上传/选择并预览 PDF → 打开差异分析 → 点击一次 → 只捕获 1 个 `/resume-jd-difference/analyze` POST → 查看岗位核心/三个重点/全部差异/门槛/matched 折叠 → 打开完善建议 → 确认 runId 相同 → 跳到面试准备。

- [ ] **Step 2: 添加状态与过期 E2E**

覆盖：

- 未选简历仍可打开差异页并跳回简历；
- 未分析仍可打开完善建议；
- 重复点击不产生第二个 run；
- 更换简历后两页都标 stale；
- 新分析处理中旧结果只在“查看上次结果”；
- 新分析失败后旧结果仍可显式查看；
- `?tab=jd` 兼容到差异分析。

- [ ] **Step 3: 添加 OCR 与移动端回归**

沿用现有 `__JOB_BUDDY_E2E_OCR__` 注入扫描 PDF 文本；验证解析文字能进入 V4 分析。用 390×844 viewport 验证无横向滚动、details 可键盘展开、状态有文字、按钮可见。

- [ ] **Step 4: 运行新 E2E 并修到绿灯**

Run:

```bash
E2E_FAKE_EXTRACTOR=1 pnpm playwright test tests/e2e/resume-jd-difference-workflow.spec.ts --project=chromium
```

Expected: PASS；网络日志明确只有一次 analyze POST。

- [ ] **Step 5: 运行申请工作区全量 E2E 回归**

Run:

```bash
E2E_FAKE_EXTRACTOR=1 pnpm playwright test tests/e2e/application-workspace.spec.ts tests/e2e/resume-jd-difference-workflow.spec.ts --project=chromium
```

Expected: PASS；简历上传/预览、删除记录、OCR 与新工作流均正常。

- [ ] **Step 6: 提交 E2E**

```bash
git add tests/e2e/application-workspace.spec.ts tests/e2e/resume-jd-difference-workflow.spec.ts
git commit -m "test: cover resume difference workflow end to end"
```

---

## Task 15：全量验证、占位扫描和部署前检查

**Files:**

- Modify only if verification exposes a defect in the files listed above.

- [ ] **Step 1: 运行领域测试**

Run: `pnpm vitest run src/features/resume-jd-difference`

Expected: PASS，所有 V4 单元与组件测试通过。

- [ ] **Step 2: 运行项目质量门**

Run: `pnpm verify`

Expected: lint、typecheck、Vitest 全部 PASS。

- [ ] **Step 3: 运行数据库与构建**

Run:

```bash
pnpm db:reset
pnpm test:db
pnpm build
```

Expected: pgTAP 全部 PASS；Next.js production build 成功。

- [ ] **Step 4: 扫描残留占位与错误产品文案**

Run:

```bash
rg -n "TODO|FIXME|TBD|placeholder|JD 差距分析|开始核对|下一阶段|匹配百分比|录取概率" src/features/resume-jd-difference 'src/app/(app)/applications/[id]/page.tsx' docs/superpowers/plans/2026-08-27-resume-jd-difference-workflow.md
```

Expected: 无 TODO/FIXME/TBD/placeholder；新页面不出现旧 V3 文案、匹配百分比或录取概率。计划文档中的历史说明命中可人工忽略。

- [ ] **Step 5: 扫描新页面是否仍引用 V3**

Run:

```bash
rg -n "jd-gap-analysis|JDGapAnalysis|jdGapV3|jdStructure" 'src/app/(app)/applications/[id]/page.tsx' src/features/resume-jd-difference
```

Expected: 无输出。

- [ ] **Step 6: 检查一次调用和同 run 数据关系**

Run:

```bash
rg -n "analyzeResumeJDDifference" src/features/resume-jd-difference src/app/api src/features/extraction
rg -n "structureJobDescription|compareJDGapCriteria" src/features/resume-jd-difference 'src/app/api/applications/[id]/resume-jd-difference'
```

Expected: V4 Service 只调用 `analyzeResumeJDDifference`；V4 目录和新 API 不调用旧两阶段方法。

- [ ] **Step 7: 对照设计规格做人工验收**

逐条核对：

- 工作流为 `概览 → 简历 → 差异分析 → 完善建议 → 面试准备 → 时间线`；
- 用户主动触发且一次调用；
- 总体判断在具体差异前；
- 原文和中文一起展示；
- 全部问题可访问，matched 底部折叠；
- 门槛单列；
- 完善建议只给方向、不代写；
- 无证据措辞准确；
- 旧结果/当前结果/失败状态清楚；
- 资料变化后两页同步 stale；
- Markdown 和账户导出无内部哈希或完整文档泄露。

- [ ] **Step 8: 检查 Git 差异和提交历史**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -15
```

Expected: 工作区干净；`git diff --check` 无空白错误；提交按上述任务分段。

- [ ] **Step 9: 最终提交验证中产生的必要修正**

仅在前述验证确实产生修正时执行：

```bash
git add -A
git commit -m "fix: complete resume JD difference verification"
```

- [ ] **Step 10: 部署前只报告证据，不自动部署**

记录成功的测试命令、Prompt 获胜版本、真实评测调用数和估算费用、迁移文件名、Vercel 需要新增的 `RESUME_JD_DIFFERENCE_PROMPT_VARIANT`。等待用户明确说“部署”后再执行生产迁移与 Vercel 部署。

---

## 实施时不可改变的验收原则

1. “差异”永远是 `岗位要求 → 简历现状 → 问题点 → 判断依据 → 优先级`，不是原文与中文的语言差异。
2. 当前简历没有证据不等于用户没有能力；统一使用“当前材料未找到相关证据”。
3. 同义词对齐只用于有真实证据的职责和业务语言；具体工具、数字与资格严格处理。
4. 职业档案只补充证据，不把当前简历未体现的内容算成已覆盖。
5. “完善建议”只说明修改方向和位置，不提供可直接粘贴的句子。
6. 用户点击一次只产生一个业务分析调用；两个标签读取同一个原子结果。
7. 输入变化只标记过期，不自动重新调用 AI。
8. V3 仅保留历史，不混入 V4 主页面。
