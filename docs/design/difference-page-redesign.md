# 差异分析页改版 — 实现说明

来源：Claude Design 项目 `882d082c-d6ff-4f5d-824e-d54be3ed155f`，文件 `差异分析页.dc.html`（画板 1a–1d / 2a–2b / 3a / 4a–4e，Turn 5 为实现说明）。

**核心决定**：不是撤掉贴纸，而是**全页只留一张**，让它承载结论本身而不是装饰。其余容器改柔光影。品牌性格保住，只用在唯一值得的地方。

## ① globals.css — 三个新类

| 类 | 定义 | 用途 |
|---|---|---|
| `.soft-surface` | 无描边；`border-radius: 20px`；`background: var(--white)`；`box-shadow: 0 10px 30px -26px color-mix(in srgb, var(--ink) 70%, transparent)` | 取代 `.dense-surface`，用于证据卡列表、下一步卡 |
| `.severity-band` | 4px 高；`border-radius: 999px`；`box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 22%, transparent)`；背景由 priority 提供 | 每行顶部的严重度色带。内描边是必需的 —— `--cream` 和 `--mist-blue` 在纯白上对比不足 |
| `.badge-index` | 34px 圆；`1.5px solid color-mix(in srgb, var(--ink) 22%, transparent)`；`background: var(--paper)`；墨绿数字 | 行首徽章。变体 `--gate`（珊瑚填充 + `!`）、`--matched`（薄荷填充 + `✓`） |

改 `.status-chip`：`1px 墨绿描边 + 色块填充` → `1px 当前严重度色描边 + 该色浅底`（珊瑚 `#ffece9` / 奶油 `#fffbe4` / 雾蓝 `#eef4ff`），墨绿字，`font-weight` 800 → 700。

保留不动：`.sticker-border` / `.sticker-shadow` / `.button-primary` / `.button-secondary` —— 贴纸和按钮正是它们，只需加 `border-radius: 999px` 的胶囊变体。

## ② IssueDetails — 逐行结构

保留 `details/summary`（无 JS、可打印、焦点行为免费）。`.severity-band` 放在 `details` 内、`summary` 之前，避免多包一层。

- **左侧 24px「+」→ 34px 徽章**：`group-open:rotate-45` 的加号换成 `.badge-index`（序号 / `!` / `✓`，不旋转）。展开提示移到行右侧 chevron，`group-open:rotate-180`
- **右侧 chip 双标签拆开**：`{priorityCopy} · {typeCopy}` 挤在一个右浮 chip 里 → 移到标题上方一行，`priorityCopy` 留描边 chip，`typeCopy` 是紧随其后的 12px muted 纯文字
- **六格 dl → 三格**：删「JD 原文」（已在行内显示）、「中文解释」（就是行标题）、「优先级」（就是 chip）。剩「简历现状 / 问题点 / 判断依据」+ 条件「档案依据」。`lg:grid-cols-2` → `grid-cols-[repeat(auto-fit,minmax(220px,1fr))]`，侧栏收起时自动重排，不用断点
- **面板容器**：「顶部细线 + `--paper` 满宽底」→ 缩进的柔白圆角内嵌块（`margin-left` 对齐徽章右缘 58px，radius 14px）。视觉上「依据属于这一行」，不再像另起区域

## ③ 三列表合并 + 排序

「具体差异」+「岗位门槛待确认」+「已经对上的内容」合成一个列表，排序 `critical → gate → important → minor → matched`。删掉门槛的 2px 珊瑚外框和「已对上」的外层 `details` —— 门槛靠珊瑚 `!` 徽章区分，已对上靠薄荷 `✓`。三个 `aria-labelledby` 合成一个。

新增刻度胶囊：贴纸底部虚线以下五枚，数字由 `result.issues` 现场统计（`priority` + `isGate` + `matched.length`），不需要新字段。

## ④ 贴纸合并（唯一有回归风险的一步）

「本次对照简历」条 + 雾蓝「总体差异」头 + `analysis-control` 的控制条 → 一张奶油贴纸。`summaryZh` 提为 `h1`（30px/900），文件名与日期降为贴纸内 12px 元信息，导出与重新分析成为贴纸内两枚胶囊次级按钮。

`analysis-control` 与 panel 的贴纸是同一容器的不同状态，需合并渲染 —— 要么 control 接收 `summaryZh` 作为 children，要么把贴纸提到 `[id]/page.tsx` 由两者共用。**这是唯一需要动结构的地方**，其余（OCR、abort、缓存、`errorCopy`、`statusCopy`）逻辑全不动。

下一步卡的奶油贴纸底改 `.soft-surface`，CTA 反而升级成 `.button-primary` 胶囊 —— 它成为全页唯一的硬投影按钮。

## ⑤ font-black 降级

规则：**900 只给 `heading-font` 的真标题**，行标题 700，正文 500，元信息 600。

| 现状 | 改成 | 位置 |
|---|---|---|
| `heading-font` h2 | 保留 900 | 合并后只剩两个（列表标题、下一步） |
| 行标题 / 能力项 / 已匹配标题 | 700 | 新补的中间档，撑「可扫描的行首句」 |
| `dt` 字段标签（11px uppercase） | 800，颜色 `--ink-soft` → `--ink-muted` | 小字号需要重字重才立得住，900 在 11px 下糊 |
| 全部英文 kicker | **删除** | Job brief / Executive read / Evidence review / Qualification check / Confirmed alignment / Soft workflow。中文界面里只是装饰，中英混排是这页最重的负担 |
| 文件名 / 按钮 / 计数 / CTA | 700 | 900 会让胶囊显得挤 |
| 「01」「重点 01」序号 | **删除** | 新列表的序号由徽章承担 |
| 档案依据药丸 | 600，去掉 1px 墨绿描边，改纯薄荷底 | |
| 正文与引文的 `font-semibold` | 500，`leading-6` → `leading-[1.65]` | |

## ⑥ 删两个区域

- **「岗位核心判断」**整段：薄荷贴纸 + 三个满宽 `coreCapabilities` 格子 → 一行「薄荷 tag『这个岗位真正要什么』+ `missionZh` 一段 + 下面薄荷药丸」。数据不变，仍是 `result.jobCore`
- **「重点 01-03」**：`leadingIssues` 三栏 `ol` 连同 `topIssues()` 一起删。它把前三条 issue 的 `problemZh` 讲第二遍 —— 排序后前三条本来就在最上面。`overallDifference.topIssueIds` 改为只用于排序权重

## 页面外壳

- `[id]/page.tsx`：`SetupProgress` 四步条在 `tab=difference` 下不再渲染（属于概览）。48px 的职位大标题在此 tab 收缩到单行 —— 贴纸的 `h1` 才是这页的标题。`max-w` 1240 → 1040
- tab 导航：未激活无边框纯文字 600，激活项奶油底 + 2px 描边 + 2px 投影
- `app-shell.tsx`：只改 `.logo-mark`（旋转奶油方块「J」→ 墨绿圆角方 + 薄荷与奶油相扣双圆），阴影改柔光。侧栏顶栏其余不动

## 顺序

① → ② → ③ → ④ → ⑤ → ⑥

②③ 之后就能看出效果；④ 是唯一有回归风险的一步。
