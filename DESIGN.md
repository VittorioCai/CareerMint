---
name: 求职搭子
description: 可信、清晰、可追溯的海外求职工作台（Apple 风格）
colors:
  canvas: "#f5f5f7"
  paper: "#ffffff"
  surface-muted: "#e8e8ed"
  ink: "#1d1d1f"
  ink-muted: "#636366"
  ink-soft: "#86868b"
  line: "#d2d2d7"
  accent: "#0071e3"
  accent-ink: "#0066cc"
  mint-strong: "#1d7a36"
  danger: "#d70015"
typography:
  display:
    fontFamily: "-apple-system, SF Pro Display, Inter, PingFang SC, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.12
  headline:
    fontFamily: "-apple-system, SF Pro Display, Inter, PingFang SC, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "-apple-system, SF Pro Text, Inter, PingFang SC, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "-apple-system, SF Pro Text, Inter, PingFang SC, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  control: "12px"
  surface: "18px"
  pill: "980px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  status-chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
---

# Design System: 求职搭子

所有取值以 `src/app/globals.css` 的 token 为准；本文件说明它们的含义和使用规则。

组件类（`.button-*`、`.status-chip`、`.type-*` 等）位于 `@layer components`，同一元素上的 Tailwind utility 会覆盖它们：组件类给出默认值，utility 表达这一处的状态。只有手机 44px 触控高度和减少动效两条规则刻意留在层外，以压过 utility。排版角色（`.type-*`）已经决定字重和行宽，不要再叠加 `font-*` 或 `max-w-*`。

## 1. Overview

**Creative North Star: “Apple 式的安静工作台”**

界面参照 apple.com 与 Apple Human Interface Guidelines：冷灰画布、白色表面靠柔和光影浮起、唯一的蓝色表示“可以操作”，其余颜色只出现在有状态的地方。内容先于装饰，排版与留白承担层级，而不是描边和色块。

**Key Characteristics:**

- 系统字体（San Francisco / PingFang），非 Apple 设备回退到 Inter
- 一种强调色：Apple 蓝，只用于主操作、链接、焦点和当前位置
- 胶囊按钮、18px 圆角表面、1px 细分隔
- 顶栏与手机标签栏为半透明毛玻璃，内容从下方透出
- 深色模式使用 Apple 分组背景层级（#000 → #1c1c1e → #2c2c2e），靠变亮而非阴影表达层次
- 以渐进披露控制信息密度；原文、翻译、证据三层清晰分离

## 2. Colors

### Accent

- **Apple 蓝 `--accent`**：主按钮底色（白字 4.70:1）、焦点环、选区、手机标签栏当前项。
- **链接蓝 `--accent-ink`**：以蓝色书写的文字，在所有底色上保持 ≥4.5:1。

### Semantic

- **严重度 `--sev-*`**：关键 → 门槛 → 重要 → 次要 → 已对上，明度单调，灰度下顺序仍可辨（由单测守护）。
- **危险 `--danger`**：Apple 红，删除等不可逆操作为实心按钮。
- **完成 `--mint-strong`**：Apple 绿，用于已确认、已完成。

### Neutral

- **画布 `--canvas`** #f5f5f7、**表面 `--paper`** 白、**凹槽 `--surface-muted`** #e8e8ed。
- **墨色 `--ink`** #1d1d1f；**次要文字 `--ink-muted`** 在三种底色上都 ≥4.5:1。

**The Fixed Meaning Rule.** 同一种颜色在不同页面必须表达同一种状态；蓝色只表示“可操作 / 当前位置”，不得用作装饰。

## 3. Typography

**Font:** `-apple-system`（SF Pro Text / Display），中文 PingFang SC，其他平台回退 Inter。SF 无法自托管，直接向系统请求，不产生网络请求和布局偏移。

**Character:** 标题 600 字重、克制；正文 400。中英文混排不使用负字距（CJK 字形会粘连）。

层级见 `globals.css` 的 `.type-*` 角色：display / title / page-title / section / heading / body / caption / micro / eyebrow。叙述文本宽度上限 40em。

## 4. Elevation

- **浅色**：表面用极淡的双层阴影（`--elevation-1/2`）从画布浮起；表格、正文、预览保持平整。
- **深色**：黑色阴影在黑底上不可见，表面改为比底色更亮并加 1px 内描边。
- **Chrome**：顶栏与手机标签栏为 `.chrome-bar`（72% 画布色 + `saturate(180%) blur(20px)`）；不支持 backdrop-filter 时回退为不透明画布。弹窗遮罩同样轻度模糊。

## 5. Components

### Buttons

- **Shape:** 胶囊（980px 圆角），无描边、无阴影。
- **Primary:** Apple 蓝底白字；一个工作区只突出一个主动作。
- **Secondary:** 凹槽灰底、墨色文字。
- **Danger:** Apple 红实心。
- **Hover / Active:** 悬停改变色调，按下降低不透明度；按钮不上浮、不缩放。

### Inputs / Fields

白底、1px `--line` 细边、12px 圆角；聚焦时边框变蓝并出现 4px 半透明蓝色光晕。错误同时显示文字。

### Chips

胶囊圆角、状态色填充；必须包含符号或文字，不能只靠颜色区分状态。

### Cards / Containers

18px 圆角，白色表面，默认只用 `--elevation-1`；只有承载结论的表面使用 `--elevation-2`。

### Navigation

桌面左侧导航当前项为凹槽灰底；手机底部标签栏当前项为蓝色文字，半透明毛玻璃背景。

### Segmented Controls

凹槽灰轨道，选中段为白色表面加轻阴影，与 iOS 分段控件一致。

## 6. Do's and Don'ts

### Do:

- **Do** 让排版和留白建立层级，颜色只表达状态和可操作性。
- **Do** 把“没有证据”和“需要判断”排在有证据内容之前。
- **Do** 在长列表中使用细分隔和折叠，保持首屏可扫描。
- **Do** 每次改色都复核 4.5:1（正文）与 3:1（非文字指示）对比度。

### Don't:

- **Don't** 做以聊天框为中心、把结构化任务藏进对话的通用 AI 工具。
- **Don't** 引入第二种强调色，或把蓝色用在不可点击的元素上。
- **Don't** 给内容卡片加粗描边、错位阴影或层层嵌套。
- **Don't** 在内容表面上使用毛玻璃——半透明只属于悬浮在内容之上的 chrome。
- **Don't** 用颜色单独表达状态，也不要用动画装饰静态内容。
