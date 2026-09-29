---
name: 求职搭子
description: 可信、清晰、可追溯的海外求职工作台
colors:
  canvas: "#f4f3f0"
  paper: "#ffffff"
  surface-muted: "#eceae5"
  ink: "#1f2320"
  ink-muted: "#5c635d"
  ink-soft: "#8b928e"
  line: "#e4e3df"
  sev-gate: "#f7e2df"
  sev-gate-ink: "#5c2018"
  sev-critical: "#fdeceb"
  sev-critical-ink: "#8c2f22"
  sev-important: "#fbf1dc"
  sev-important-ink: "#7a5a12"
  sev-minor: "#f0f1f0"
  sev-minor-ink: "#5d6560"
  sev-matched: "#e6f4ec"
  sev-matched-ink: "#1f6b47"
  danger: "#a5342a"
  brand-mint: "#bdebd7"
  brand-cream: "#fff2a8"
typography:
  display:
    fontFamily: "Nunito Sans, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 4.7vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "0"
  title:
    fontFamily: "Nunito Sans, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, PingFang SC, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  eyebrow:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, PingFang SC, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  segment: "8px"
  button: "10px"
  input: "12px"
  dense-surface: "14px"
  surface: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.button}"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "12px 14px"
  status-chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "4.5px 9.6px"
---

# Design System: 求职搭子

> 取值以 `src/app/globals.css` 为准，本文件描述的是它。两者不一致时，先确认哪一边是对的，再把另一边改过来；不要照着本文件去"纠正"样式表。
>
> 本文件曾长期描述一套已经被替换的视觉语言（奶油黄主按钮、2px 墨绿描边、错位阴影、薄荷侧栏），于 2026-09-29 按实现重写。`.impeccable/design.json` 由旧版本生成，尚未重新生成，不要引用。

**实现约定.** 组件类（`.button-*`、`.status-chip`、`.type-*` 等）位于 `@layer components`，同一元素上的 Tailwind utility 会覆盖它们：组件类给出默认值，utility 表达这一处的状态。只有手机 44px 触控高度和减少动效两条规则刻意留在层外，以压过 utility。排版角色（`.type-*`）已经决定字重和行宽，不要再叠加 `font-*` 或 `max-w-*`。

组件类不能加 Tailwind 的变体前缀。`md:scroll-x-affordance` 不会生成任何 CSS——变体只对 utility 生效。需要按断点生效的组件类，把媒体查询写在类自己的定义里（`.scroll-x-fade` 是例子）。

**借用的 Apple 做法.** 只借四处：顶栏与手机标签栏为半透明毛玻璃（`.chrome-bar`，72% 画布色 + `saturate(180%) blur(20px)`，不支持时回退为不透明画布）；正文在 Apple 设备上使用系统字体（SF / 苹方），其他平台仍为 Inter，标题保持 Nunito Sans；弹窗遮罩轻度模糊；字体使用灰阶抗锯齿。内容表面不使用毛玻璃。

## 1. Overview

界面是一张安静的工作台：暖灰的底，白色的表面，近黑的墨色文字。**颜色只在某样东西有状态时出现**——一条差异的严重度、一条事实是否已确认、一次操作是否危险。没有状态的地方没有颜色。

任务先于装饰。列表、表格、正文预览和长 JD 保持平整，靠底色和细分隔线建立层次；表面从画布上抬起靠的是柔和的投影，不是描边。界面拒绝聊天框中心化、层层嵌套卡片和没有优先级的信息堆积。

**Key Characteristics:**

- 中性色板，状态才上色
- 以渐进披露控制信息密度
- 原文、翻译、证据三层清晰分离
- 每个视图只有一个最重的按钮
- 桌面高效，手机保留关键操作
- 浅色与深色两套分级，深色不是反相

## 2. Colors

### Neutral

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--canvas` | `#f4f3f0` | `#161a18` | 页面背景 |
| `--paper` | `#ffffff` | `#1f2422` | 卡片、表格、表单等表面 |
| `--surface-muted` | `#eceae5` | `#2a302d` | 次要按钮、选中的分段、槽位 |
| `--ink` | `#1f2320` | `#e8ece9` | 正文、标题、主按钮填充、焦点环 |
| `--ink-muted` | `#5c635d` | `#a3aca7` | 次要文字、占位符。在 paper、canvas、surface-muted 三种底上都过 4.5:1 |
| `--ink-soft` | `#8b928e` | `#79837e` | 只用于装饰性的线和下划线。**不用于文字**：它在白底上是 3.18:1 |
| `--line` | `#e4e3df` | `#303734` | 分隔线、表面边界 |

### Severity

严重度是成对的：一个浅底、一个深字。五级按明度单调排列，所以顺序在灰度、色弱和打印下都成立。

| 级别 | 底 | 字 | 含义 |
|---|---|---|---|
| gate | `--sev-gate` `#f7e2df` | `#5c2018` | 资格门槛，改简历解决不了 |
| critical | `--sev-critical` `#fdeceb` | `#8c2f22` | 关键差异 |
| important | `--sev-important` `#fbf1dc` | `#7a5a12` | 重要差异；也用于"待确认""结果已过期" |
| minor | `--sev-minor` `#f0f1f0` | `#5d6560` | 次要差异 |
| matched | `--sev-matched` `#e6f4ec` | `#1f6b47` | 已对上、已确认 |

`--danger`（`#a5342a`）只用于破坏性操作的实心按钮和错误文字。

### Brand

`--mint`（`#bdebd7`）和 `--cream`（`#fff2a8`）是品牌标记的两个颜色，保留给 logo 和文字选中的底色。它们不再承担界面语义。logo 的颜色是写死的字面量，不随主题变化。

**The Fixed Meaning Rule.** 同一种颜色在不同页面表达同一种状态，同一种状态在同一处只有一种颜色。落地页演示卡曾经给两个"有证据"用了一绿一灰。

**不单靠颜色.** 状态必须同时有文字或符号。提示语不能用颜色指代对象（"珊瑚色的行"），要用它带的标签。

## 3. Typography

**标题：** Nunito Sans（`.heading-font`），后备 Inter 和系统无衬线。
**正文：** Apple 设备上是系统字体（SF / 苹方），其他平台是 Inter。

七个角色。界面上每一段文字都是其中之一，角色同时决定字号、字重、行高和行宽。

| 角色 | 类 | 字号 | 字重 | 行高 | 用在哪 |
|---|---|---|---|---|---|
| display | `.type-display` | `clamp(2.5rem, 4.7vw, 3.75rem)` | 700 | 1.12 | 落地页标题，全站一处 |
| title | `.type-title` | 2rem，≥640px 为 2.5rem | 700 | 1.25 | 登录、注册、404 等独立页面的标题 |
| page-title | `.type-page-title` | 1.625rem，≥640px 为 1.875rem | 700 | 1.15 | 应用内页面的 H1 |
| section | `.type-section` | 1.25rem | 700 | 1.3 | 页面内的 H2 |
| heading | `.type-heading` | 1rem | 600 | 1.45 | 卡片或行自己的标题 |
| body | `.type-body` | 1rem | 400 | 1.75 | 要读完整句的正文，行宽上限 40em |
| caption | `.type-caption` | 0.875rem | 400 | 1.65 | 次要说明、时间戳，行宽上限 40em |
| micro | `.type-micro` | 0.6875rem | 600 | 1.2 | 控件和标签上的字，从不是句子 |

`.type-eyebrow` 是加了 0.12em 字距并转大写的 micro，用于标题上方的小标签。

**display 的字号是算过的。** 它要让下面的主按钮留在第一屏：在 1280×800 和 1024×768 上，落地页主按钮都必须完整可见。

**标题不加负字距。** 收紧大标题是拉丁文的习惯，汉字是满格的方块，收紧会让它们挤成一团。

**中文标题按分句断行。** `.type-display` 和 `.type-title` 带 `word-break: keep-all` 与 `overflow-wrap: anywhere`：只在标点和空格处断行，分句比一行还长时才退回任意断行。两个汉字之间处处可断，`text-wrap: balance` 会在其中任选，把"准备"断成"准 / 备"。模型生成的标题没法手工分段，给它加 `break-keep wrap-anywhere`。

**一页一个标题.** 同一页上不出现两个同级的大标题。登录页右栏的标语是 section，不是第二个 title。

**外文原文**（`.foreign`）不用斜体，始终用次要色，始终带 `lang`。

## 4. Elevation

表面靠柔和的投影从画布上抬起，不靠描边，也没有错位的硬阴影。

| Token | 浅色 | 用在哪 |
|---|---|---|
| `--elevation-1` | `0 1px 2px rgba(31,35,32,.05)` | 主按钮、`.dense-surface` |
| `--elevation-2` | 上一条，加 `0 12px 32px -22px rgba(31,35,32,.5)` | `.soft-surface`、弹出菜单 |
| `--elevation-row` | elevation-1，加 `0 8px 22px -20px rgba(31,35,32,.5)` | 可展开的行 |

深色下阴影不成立——近黑的底上看不见黑色的影子。深色的三个 token 都是 1px 的内描亮边：表面比地面亮，而不是往地面上投影。

| 类 | 圆角 | 投影 | 用在哪 |
|---|---|---|---|
| `.soft-surface` | 16px | elevation-2 | 承载结论或一组内容的主要表面 |
| `.dense-surface` | 14px | elevation-1 | 信息密集的次要表面 |

**The Flat-by-Default Rule.** 表格、正文、预览和折叠列表内部不再加投影。表面里面不套表面。

## 5. Components

### Buttons

圆角 10px，没有描边。

- **Primary**（`.button-primary`）：墨色填充，画布色文字。它是页面上最深的东西，这就是它的强调。
- **Secondary**（`.button-secondary`）：`--surface-muted` 填充，墨色文字。
- **Danger**（`.button-danger`）：`--danger` 实心填充。浅色底配深字读不出"三思"，所以破坏性操作是实心的。
- **Text action**（`.text-action`）：看起来是文字、实际是控件的操作，带下划线。
- 按下时下移 1px；`.press` 在悬停时上抬 1px。
- 手机上四类控件的最小高度都是 44px，这条规则在层外，压过标记里的 `min-h-*`。

**一个视图一个主按钮.** 侧栏的"新建申请"是全局主操作；除此之外，内容区里每个视图至多一个 primary。

**列表行里重复出现的操作不用 primary.** 二十条待确认的事实不是二十个主操作。行内最该点的那个用 secondary，其余用 text action。弹窗是自己的一层，里面可以有自己的 primary。

**破坏性操作不放在标题旁边.** 它在编辑态里，或在对象自己的详情页上，并且先经过一次确认。确认框复述将要失去的东西。完成后在一个不会随对象一起消失的地方给出回执。

### Chips

- `.status-chip`：胶囊，默认 `--surface-muted` 底、次要色字，0.7rem / 600。状态由 utility 或 `.status-mint` / `.status-yellow` / `.status-blue` 上色。
- `.severity-chip` 配 `.severity-*`：差异的严重度。
- `.badge-index`：28px 的圆形序号，取所在行的严重度色。
- 必须带文字或符号。

### Inputs

`.form-input`：最小高度 3rem，1.5px `--ink-soft` 描边，12px 圆角，白底。悬停时描边变 `--ink-muted`；聚焦时描边变墨色并出现 3px 的 `--focus-halo`。

占位符是次要色，只放示例。**规则和要求不写在占位符里**：它在开始输入的那一刻消失，而那正是要对照它的时候。写在标签里，或写在输入框下方并用 `aria-describedby` 关联。

### Focus

`:focus-visible` 是 2px 墨色轮廓，偏移 2px。墨色随主题翻转，所以焦点环在每一种底上都看得见。

### Segmented control

`.segment`：8px 圆角，手机 44px 高，桌面 32px 高，标签不换行。选中项是 `--surface-muted` 底加半粗；未选中项是次要色。会改变地址的用链接并带 `aria-current`，只改变设置的用按钮并带 `aria-pressed`。

### Navigation

桌面：左侧 244px 固定侧栏，画布色底，右侧一条分隔线；顶部是吸顶的毛玻璃工具栏。手机：侧栏收起，底部是四格的毛玻璃标签栏，顶栏保留"新建"和账户菜单。

### Disclosure

折叠只有一种画法：右侧一个向下的箭头，展开时转 180°。`details.reveal` 带高度过渡。展开的控件要说明自己是否展开（`<summary>`，或带 `aria-expanded` 的按钮）。

差异行折叠时先给严重度、类型、判断和两行原文；展开后依次是 JD 原文、简历现状、问题、判断依据、档案依据。职业事实已确认的默认收起成一行，待处理的默认展开。

### Horizontal scroll

- `.scroll-x-affordance`：给表格用。阴影画在容器的背景上，内容滚过去时露出来。
- `.scroll-x-fade`：给一排不透明的卡片用。卡片会盖住背景上的阴影，所以改用遮罩让边缘的内容淡出；轨道右侧留出与遮罩等宽的内边距。只在看板是看板的宽度上生效。
- `.snap-columns`：列吸附到自己的左边缘。

### Out-of-date results

过期是关于一个结果最先要知道的事。它是卡片顶部的一条色带，写明原因；下面的结论退成次要色。

## 6. Motion

四类，类别决定时长，没有哪个动画自己挑数字。

| 类别 | 含义 | 类 | 时长 |
|---|---|---|---|
| enter | 原来没有，现在有了 | `.motion-enter` | 220ms |
| exit | 原来有，正在离开 | `.motion-exit` | 140ms |
| move | 还在，但换了大小或位置 | `.reveal`、`.snap-*` | 320ms |
| state | 指针下的控件 | `.press`、按钮 | 140ms |

进入比离开慢。什么都不缩放——缩放会让文字重新栅格化，13–15px 的汉字上看得出模糊。位移永远是 4px。每条规则的终态就是静态布局，所以在 `prefers-reduced-motion` 下得到的是同样的像素。

## 7. Do's and Don'ts

### Do:

- **Do** 把"没有证据"和"需要判断"排在有证据内容之前，把待处理的排在已处理的之前。
- **Do** 在长列表中使用细分隔和折叠，保持首屏可扫描。
- **Do** 为删除、导出、确认和长任务提供明确反馈。
- **Do** 让列表里的每一项都有一个看得见的入口。
- **Do** 在手机端把正文、建议和证据拆成顺序清晰的视图。
- **Do** 改完界面后在 `/dev/states` 上看一遍空、单条、拥挤、超长四种状态。

### Don't:

- **Don't** 做以聊天框为中心、把结构化任务藏进对话的通用 AI 工具。
- **Don't** 做卡片层层嵌套、每个元素都有描边和阴影的界面。
- **Don't** 做信息无优先级、证据和原文一次性全部展开的拥挤后台。
- **Don't** 使用紫色渐变、内容表面上的玻璃拟态和模板化 SaaS 仪表盘。
- **Don't** 用颜色单独表达状态，也不要用动画装饰静态内容。
- **Don't** 给没有状态的东西上色。
- **Don't** 把演示画成能点的样子：画出来的按钮不是 `<button>`。
