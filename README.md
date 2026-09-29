# CareerMint

CareerMint 是一个面向海外求职的个人工作台。它把用户已有简历转换为可追溯、可核对、可复用的职业事实，并让每个目标岗位都有独立、私密的申请工作区，而不是让 AI 猜测或虚构经历。

当前可用流程：注册与登录 → 设置求职目标 → 上传 PDF/DOCX → 用户授权后进行 AI 文字分析 → 逐条确认事实 → 添加 JD 并建立申请工作区 → 选择本次申请的对照简历 → 用户点击后分析简历与 JD 的差异，得到有来源的差距和完善方向 → 导出差异分析 Markdown → 组合通用题与岗位增量题（可由 AI 生成候选题）并记录面试提纲 → 在看板或表格中管理投递 → 更新阶段并保留时间线 → 导出全部个人数据或删除账户。

JD 分析、岗位简历建议和简历版本生成三条流水线已于 2026-09 移除（迁移 `202609100005`），由上面的简历与 JD 差异分析取代。

## 技术栈

- Next.js App Router、React、TypeScript、Tailwind CSS
- Supabase Auth、Postgres、Row Level Security 和私有 Storage
- DeepSeek 文本模型，通过独立 `AIProvider` 接口接入
- PDF.js 与 Mammoth，用于服务器端 PDF/DOCX 文字提取
- Vitest、React Testing Library、Playwright 和 pgTAP

### 扫描版 PDF OCR

文字型 PDF 和 DOCX 优先走服务端原生文字解析。仅当 PDF 被判定为扫描件、原生解析返回 `resume-text-too-short` 时，浏览器才会按需加载官方百度 PP-OCRv6 Small，在本地逐页识别；最多处理 10 页，并可随时取消。模型文件会从公共源下载，但简历页面像素不会上传到第三方 OCR API。

本地 OCR 不产生按次 API 费用；识别出的文字仍会在用户授权 AI 的流程中提交 CareerMint 后端，结构化事实提取仍需要 DeepSeek，且可能产生费用。没有 `DEEPSEEK_API_KEY` 时，AI 提取不可用。

建议使用 Node.js 24（最低 22.13）、pnpm，以及已启动的 Docker Desktop。当前锁定的 pnpm 11.19 需要 Node.js 22.13 或更高版本。

## 本地启动

```bash
pnpm install
pnpm db:start
cp .env.example .env.local
pnpm db:reset
pnpm dev
```

执行 `pnpm db:start` 后，用 `supabase status -o env` 获取本地 `PUBLISHABLE_KEY` 和 `SECRET_KEY`，分别填写到：

```dotenv
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

浏览器访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。本地邮件验证与密码重设邮件可在 [Mailpit](http://127.0.0.1:54324) 查看。

生产环境支持两条邮箱确认路径。对于 2026-06-03 之后创建、使用默认 SMTP 的 Supabase Free 项目，直接使用 Supabase 内置的
`{{ .ConfirmationURL }}` 模板即可，无需修改邮件模板或现在配置 SMTP；注册动作传入的
`/auth/callback?next=/onboarding` 会让默认确认链接完成 code 回调后打开 `/onboarding`，默认流程已受支持。

只有在配置了自定义 SMTP 或升级到支持自定义模板的方案后，才需要考虑同步可选的
`supabase/templates/confirmation.html`，以使用 `token_hash`/`verifyOtp` 路径。本地
`supabase/config.toml` 仍指向该模板，供本地开发和未来的自定义邮件配置使用。

如果 macOS 上 Docker 无法挂载 `Documents` 下的项目，请在 Docker Desktop 中授予相应文件访问权限，或把项目放到 Docker 可访问的目录。这不会影响部署后的应用逻辑。

## 环境变量

完整字段见 `.env.example`。核心 AI 配置：

```dotenv
DEEPSEEK_API_KEY=replace-with-deepseek-api-key
AI_TEXT_PROVIDER=deepseek
AI_TEXT_MODEL=deepseek-flash
RESUME_JD_DIFFERENCE_PROMPT_VARIANT=p1
AI_PRICE_SCHEDULE_JSON=（见 .env.example，含 2026-09-10 采集的真实价格）
E2E_FAKE_EXTRACTOR=0
```

`RESUME_JD_DIFFERENCE_PROMPT_VARIANT` 选择差异分析使用的 prompt（`p1` / `p2` / `p3`，默认 `p1`）。它是 prompt 版本的一部分，也进 `input_hash`，所以改它会让已缓存的分析全部重跑一次。

`JD_GAP_MATCH_PROMPT_VARIANT` 属于已移除的 JD 分析流水线，代码已不再读取；线上环境里如果还留着这个变量，不会报错，可以直接删掉。当时的评测摘要保留在 `docs/evaluations/2026-08-25-jd-gap-prompt-comparison.md` 作为历史记录，对应的评测脚本和 fixture 已删除。

没有真实 `DEEPSEEK_API_KEY` 时，简历提取、差异分析和面试题生成都会显示可恢复的“AI 暂不可用”状态，不会产生模型费用。单元测试和本地 E2E 使用 mock/fake provider，不会请求 DeepSeek；其中 `E2E_FAKE_EXTRACTOR=1` 覆盖简历提取、差异分析和面试题生成，仅供 local/dev E2E 使用，生产环境禁用且不会调用真实 AI。

### 价格配置

模型价格不写死在业务代码中。`AI_PRICE_SCHEDULE_JSON` 必须包含：

- `version`、`provider`、`model`、`currency`；
- `observedAt` 和官方 `sourceUrl`；
- `effectiveFrom`、可为空的 `effectiveUntil`；
- 默认的缓存命中输入、缓存未命中输入和输出单价；
- 可选 UTC 峰值时间窗及对应费率。

费率单位为每百万 token 的 USD 数值。时间戳用 ISO 8601，峰值窗口用 `HH:mm` UTC。

**`model` 必须和 `AI_TEXT_MODEL` 完全相等。** 三处服务都通过 `features/ai/pricing.ts` 的 `priceScheduleFor` 比较这两个值，不相等就整份价目表被丢弃、这次运行的成本记成 `null`。运行本身不会失败，界面上也看不出来，唯一的信号是服务端日志里的一条 `ai-price-schedule-model-mismatch` error（只含价目表版本和两边的 provider/model 标识）。`price-schedule-example.test.ts` 会守住 `.env.example` 里这一对，但它看不到 Vercel，改完线上要手动核对，或者在日志里搜这条 error。

`AI_TEXT_MODEL` 也进 `input_hash`，所以改它会让已缓存的分析全部作废一次。这是正确行为：换了模型就是另一次运行。

当前配置基于 2026-09-10 从 [DeepSeek 官方价格页](https://api-docs.deepseek.com/quick_start/pricing) 采集的 V4.1-Flash 价格，含高峰/低峰两档（高峰为 UTC 周一至周五 01:00–04:00、06:00–10:00）。schema 没有星期概念，所以周末会按高峰计价 —— 这会高估成本、不会低估。供应商改价时重新采集并 bump `version`。

## 隐私与事实安全

- 简历仅接受内容签名匹配的 PDF/DOCX，单文件上限 10 MiB。
- 原文件存储在用户专属的私有 bucket 路径；下载链接短时有效。
- 文件在服务器确定性提取文字，不会把原文件直接发送给模型。
- 完整简历文字不会在提取后写入数据库，也不会进入普通日志。
- JD 原文保存在用户自己的申请工作区，不写入普通日志；访问受用户级 RLS 隔离。
- 差异分析只在用户点击后调用；输入哈希包含 JD、所选简历、已确认事实和模型，相同资料复用已有结果。
- 差异分析的模型输出要经过 schema 校验并与 JD、简历原文核对；档案依据只能引用当前用户已确认的事实。
- 模型输出必须通过 JSON Schema、Zod 和原文证据子串检查。
- 提取结果和手动事实默认都是 `pending`；只有用户勾选明确确认后才能变成 `confirmed`。
- 同一文件重复点击会复用幂等任务，不重复创建任务或事实集合。
- 用户可以下载包含职业档案、申请/JD、阶段时间线、分析结果和原始文件的 ZIP；导出不包含内部存储路径。
- 删除账户时先删除私有文件，再删除认证身份；文件删除失败会保留账户供重试。

## 部署

**先数据库、后代码。** 这不是习惯问题：当前 `main` 的代码如果先上，会在生产数据库上直接报错（差异分析页面 500、分析无法启动）。具体失败模式、远端迁移历史漂移的处理，以及环境变量的两处耦合，见 [`docs/DEPLOYING.md`](docs/DEPLOYING.md)。

## 验证

应用层：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

数据库层：

```bash
pnpm db:reset
pnpm test:db
pnpm exec supabase db lint --local --schema public --level error --fail-on error
```

完整本地流程使用确定性假模型：

```bash
E2E_FAKE_EXTRACTOR=1 pnpm test:e2e
```

`E2E_FAKE_EXTRACTOR=1` 仅在 local/dev E2E 启用确定性的简历提取、差异分析与面试题生成；生产环境禁用，不调用真实 AI。E2E 会创建并最终删除随机测试账户。

## 脚本一览

| 命令 | 作用 | 前置条件 |
|---|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 开发服务器、生产构建、运行构建产物 | `.env.local` |
| `pnpm verify` | 依次跑 lint、typecheck、单测；提交前的门槛 | 无 |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | 单独跑其中一项；`pnpm test:watch` 为监听模式 | 无 |
| `pnpm test:e2e` | Playwright 端到端测试（不含真实 OCR） | 本地 Supabase，`E2E_FAKE_EXTRACTOR=1` |
| `pnpm test:e2e:real-ocr` | 用真实 WebAssembly 引擎识别扫描版简历；改动 OCR 资产加载前后各跑一次 | 本地 Supabase |
| `pnpm test:e2e:perf` | 对生产构建量布局偏移和传输体积 | 本地 Supabase |
| `pnpm db:start` / `pnpm db:reset` | 启动本地 Supabase、重放全部迁移 | Docker |
| `pnpm test:db` | pgTAP：RLS 与 RPC 权限 | 本地 Supabase |
| `pnpm db:types` | 从本地数据库重新生成 `src/lib/supabase/database.types.ts` | 本地 Supabase |
| `pnpm eval:resume-jd-difference --dry-run` | 差异分析 prompt 评测的预演，不调用模型。去掉 `--dry-run` 的真实运行目前会在第一次调用时报错：脚本仍按旧接口检查 `max_tokens`，而差异分析已改发 `max_output_tokens`（待修） | 无 |

`postinstall` 会运行 `scripts/sync-ocr-assets.mjs`：把 onnxruntime 的 WebAssembly 运行时复制到 `public/ocr/wasm/<版本>/`，并重新生成 `src/features/source-assets/ocr/runtime-version.ts`。这个文件是生成的，不要手改。`scripts/create-test-fixtures.mjs` 用来重新生成测试用的 PDF/DOCX。

## 视觉基线

颜色、层级和动效的取值以 `src/app/globals.css` 里的 token 为准，浅色和深色两套都在那里；这里不再抄一份色值，抄下来的那份已经过时过一次。设计约束见 [`DESIGN.md`](DESIGN.md)，产品原则见 [`PRODUCT.md`](PRODUCT.md)。

## 当前范围

本仓库已经完成账户、职业事实、申请工作区、对照简历选择、简历与 JD 差异分析及完善方向、差异分析 Markdown 导出、通用/岗位面试题库与回答提纲、显式点击触发的 AI 岗位题建议、投递看板/表格、阶段更新时间线和首页进度摘要。深度统计会在后续计划实现。生成或改写简历、自动抓取招聘网站、自动投递、LinkedIn 自动化和虚假经历生成不在当前范围内。
