# CareerMint

CareerMint 是一个面向海外求职的个人工作台。它把用户已有简历转换为可追溯、可核对、可复用的职业事实，并让每个目标岗位都有独立、私密的申请工作区，而不是让 AI 猜测或虚构经历。

当前可用流程：注册与登录 → 设置求职目标 → 上传 PDF/DOCX → 用户授权后进行 AI 文字分析 → 逐条确认事实 → 添加 JD 并建立申请工作区 → 用户点击后解析 JD 并匹配已确认事实 → 生成岗位简历建议 → 逐条接受、编辑或拒绝 → 保存不可变 V1/V2 → 下载 DOCX/PDF → 组合通用题与岗位增量题并记录面试提纲 → 在看板或表格中管理投递 → 更新阶段并保留时间线 → 导出全部个人数据或删除账户。

## 技术栈

- Next.js App Router、React、TypeScript、Tailwind CSS
- Supabase Auth、Postgres、Row Level Security 和私有 Storage
- DeepSeek 文本模型，通过独立 `AIProvider` 接口接入
- PDF.js 与 Mammoth，用于服务器端 PDF/DOCX 文字提取
- Vitest、React Testing Library、Playwright 和 pgTAP

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

如果 macOS 上 Docker 无法挂载 `Documents` 下的项目，请在 Docker Desktop 中授予相应文件访问权限，或把项目放到 Docker 可访问的目录。这不会影响部署后的应用逻辑。

## 环境变量

完整字段见 `.env.example`。核心 AI 配置：

```dotenv
DEEPSEEK_API_KEY=replace-with-deepseek-api-key
AI_TEXT_PROVIDER=deepseek
AI_TEXT_MODEL=deepseek-v4-flash
AI_PRICE_SCHEDULE_JSON=replace-with-current-versioned-json-from-official-pricing-page
E2E_FAKE_EXTRACTOR=0
```

没有真实 `DEEPSEEK_API_KEY` 时，简历提取、JD 分析和岗位简历建议都会显示可恢复的“AI 暂不可用”状态，不会产生模型费用。单元测试和本地 E2E 使用 mock/fake provider，不会请求 DeepSeek；其中 `E2E_FAKE_EXTRACTOR=1` 覆盖简历提取、JD 分析、岗位简历建议和面试题生成，仅供 local/dev E2E 使用，生产环境禁用且不会调用真实 AI。

### 价格配置

模型价格不写死在业务代码中。`AI_PRICE_SCHEDULE_JSON` 必须包含：

- `version`、`provider`、`model`、`currency`；
- `observedAt` 和官方 `sourceUrl`；
- `effectiveFrom`、可为空的 `effectiveUntil`；
- 默认的缓存命中输入、缓存未命中输入和输出单价；
- 可选 UTC 峰值时间窗及对应费率。

费率单位为每百万 token 的 USD 数值。更新时间窗必须使用 ISO 8601，峰值窗口使用 `HH:mm` UTC。配置缺失、无效、模型不匹配或过期时，AI 提取仍可继续，但界面和任务结果不会显示金额估算。

2026-08-14 获取的价格快照在 `2026-08-16T16:00:00Z` 后失效，不得直接复制到此时间之后的生产配置。上线前应从 [DeepSeek 官方价格页](https://api-docs.deepseek.com/quick_start/pricing) 重新采集并记录观察日期与生效区间。

## 隐私与事实安全

- 简历仅接受内容签名匹配的 PDF/DOCX，单文件上限 10 MiB。
- 原文件存储在用户专属的私有 bucket 路径；下载链接短时有效。
- 文件在服务器确定性提取文字，不会把原文件直接发送给模型。
- 完整简历文字不会在提取后写入数据库，也不会进入普通日志。
- JD 原文保存在用户自己的申请工作区，不写入普通日志；访问受用户级 RLS 隔离。
- JD 分析只在用户点击后调用；输入哈希包含 JD、已确认事实和模型版本，相同资料复用已有结果。
- 每项结构化要求必须附带可在 JD 原文中验证的引文；匹配证据只能引用当前用户已确认事实，并由数据库再次校验。
- 岗位简历建议只在用户点击后生成，相同 JD、要求和确认事实会复用同一任务；建议必须引用当前申请的要求和已确认事实。
- 模型或用户编辑如果加入证据中不存在的数字、日期、比例或金额，会在应用层和数据库层被阻断。
- 接受、编辑或拒绝只改变当前审核草稿；保存会创建完整且不可覆盖的 V1/V2，并在事实被删除后仍保留创建时快照。
- 模型输出必须通过 JSON Schema、Zod 和原文证据子串检查。
- 提取结果和手动事实默认都是 `pending`；只有用户勾选明确确认后才能变成 `confirmed`。
- 同一文件重复点击会复用幂等任务，不重复创建任务或事实集合。
- 用户可以下载包含职业档案、申请/JD、阶段时间线、分析结果、简历建议、版本与事实快照和原始文件的 ZIP；导出不包含内部存储路径。
- 删除账户时先删除私有文件，再删除认证身份；文件删除失败会保留账户供重试。

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

`E2E_FAKE_EXTRACTOR=1` 仅在 local/dev E2E 启用确定性的简历提取、JD 分析、岗位简历建议与面试题生成；生产环境禁用，不调用真实 AI。E2E 会创建并最终删除随机测试账户。

## 视觉基线

界面采用已确认的 V2 薄荷换位版：暖白画布 `#FFFAF2`、薄荷侧栏 `#BDEBD7`、奶油黄主操作 `#FFF2A8`、珊瑚红紧急/AI 强调 `#FF796D`、雾霾蓝辅助信息 `#C8DDFF`、墨绿黑正文 `#293733`。

设计保持“贴纸工作台”的粗圆标题和少量错位阴影，但表单、事实列表和其他信息密集区域使用白底、细分隔。原始对比稿位于：

`/Users/vittoriocai/Documents/Codex/2026-08-13/an/.superpowers/brainstorm/6983-1786661172/content/sticker-iterations.html`

选定方案：`v2-mint`。

## 当前范围

本仓库已经完成账户、职业事实、申请工作区、JD 解析与已确认事实匹配、岗位简历建议的逐条审核、不可变简历版本、DOCX/PDF 文档导出、通用/岗位面试题库与回答提纲、投递看板/表格、阶段更新时间线和首页进度摘要。以下功能会在后续计划实现：深度统计，以及显式点击触发的 AI 岗位题建议。自动抓取招聘网站、自动投递、LinkedIn 自动化和虚假经历生成不在 MVP 范围内。
