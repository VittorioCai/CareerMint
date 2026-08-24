---
name: 求职搭子
description: 可信、清晰、可追溯的海外求职贴纸工作台
colors:
  canvas-warm: "#fffaf2"
  mint-sidebar: "#bdebd7"
  mint-strong: "#55a982"
  cream-action: "#fff2a8"
  coral-urgent: "#ff796d"
  mist-blue-info: "#c8ddff"
  ink-green: "#293733"
  ink-muted: "#596761"
  ink-soft: "#94a09b"
  line-soft: "#dbe0dc"
  paper-warm: "#fffdf8"
  error-red: "#b83b36"
typography:
  display:
    fontFamily: "Nunito Sans Variable, Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Nunito Sans Variable, Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1.15
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  control: "12px"
  surface: "14px"
  sticker: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cream-action}"
    textColor: "{colors.ink-green}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink-green}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  input:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink-green}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  status-chip:
    backgroundColor: "{colors.mist-blue-info}"
    textColor: "{colors.ink-green}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
---

# Design System: 求职搭子

## 1. Overview

**Creative North Star: “贴纸求职工作台”**

界面像一张被认真整理过的求职桌面：薄荷色侧栏提供稳定方向，奶油黄标记下一步，珊瑚红只提醒真正需要关注的内容。贴纸语言提供亲和力，但数据密集区域保持安静、平整和容易扫描。

设计必须让任务先于装饰。列表、表格、正文预览和长 JD 使用细分隔与暖纸白；粗描边和错位阴影只留给当前导航、关键操作、核心状态和少量品牌时刻。界面明确拒绝聊天框中心化、层层嵌套卡片和没有优先级的信息堆积。

**Key Characteristics:**

- 温暖但不幼稚的薄荷贴纸语言
- 以渐进披露控制信息密度
- 原文、翻译、证据三层清晰分离
- 状态优先、装饰克制
- 桌面高效，手机保留关键操作

## 2. Colors

完整色板承担固定语义：薄荷稳定导航，奶油黄推动行动，珊瑚红提示风险，雾霾蓝解释信息，暖白承载密集内容。

### Primary

- **工作台薄荷绿**：用于主侧栏、完成状态和可信事实提示。
- **行动奶油黄**：用于主按钮、当前步骤和最重要的下一步。

### Secondary

- **紧急珊瑚红**：仅用于缺失证据、失败状态和 AI 入口。
- **解释雾霾蓝**：用于信息提示、焦点环和部分匹配状态。

### Neutral

- **暖白画布**：页面背景，降低长时间阅读的眩光。
- **暖纸白**：表单、表格、编辑器和信息密集区的表面。
- **墨绿黑**：正文、标题和关键描边。
- **柔和分隔线**：表格、列表与折叠内容的轻量边界。

**The Fixed Meaning Rule.** 同一种颜色在不同页面必须表达同一种状态，不得把珊瑚红用于普通装饰。

## 3. Typography

**Display Font:** Nunito Sans Variable（后备为 Inter Variable 和系统无衬线）  
**Body Font:** Inter Variable（后备为系统无衬线）

**Character:** 标题粗圆、友好而确定；正文克制、紧凑并适合中英文混排。德文长词允许自然换行，不压缩字号。

### Hierarchy

- **Display**（900，48px，1.0）：仅用于页面主标题。
- **Headline**（900，30px，1.15）：用于工作区主要板块。
- **Title**（800，20px，1.3）：用于折叠组和关键内容标题。
- **Body**（500，15px，1.6）：用于说明和证据，叙述文本限制在约 70 个字符宽度。
- **Label**（800，12px，0.12em）：用于步骤、类别和简短状态；中文标签不强制大写。

**The One Display Voice Rule.** 粗圆标题只建立层级，不进入按钮、表格数据或长段正文。

## 4. Elevation

系统采用结构性阴影而不是环境阴影。大多数表面保持平整，通过底色和细分隔建立层次；关键操作和选中贴纸使用短距离、无模糊的错位阴影。

### Shadow Vocabulary

- **关键按钮**（`4px 4px 0 #293733`）：仅用于当前主操作。
- **核心贴纸**（`8px 8px 0 #293733`）：仅用于首页主状态等少量品牌表面。
- **选中态**（`2px 2px 0 #293733`）：用于当前导航和步骤。

**The Flat-by-Default Rule.** 表格、正文、预览和折叠列表禁止使用阴影；如果一个页面超过三个明显阴影，必须重新检查层级。

## 5. Components

### Buttons

- **Shape:** 清晰圆角（12px），2px 墨绿描边。
- **Primary:** 奶油黄底、墨绿文字、4px 错位阴影；一个工作区只突出一个主动作。
- **Hover / Focus:** 160ms 状态过渡；键盘焦点使用 3px 雾霾蓝外圈。
- **Secondary:** 暖纸白底，无静态阴影；危险操作使用错误红文字并通过二次确认升级。

### Chips

- **Style:** 胶囊圆角、1px 墨绿描边、短标签。
- **State:** 必须包含符号或文字，不能只靠颜色区分“有证据”“部分匹配”“没有证据”和“需要判断”。

### Cards / Containers

- **Corner Style:** 密集表面 14px，品牌贴纸 16px。
- **Background:** 暖纸白用于密集数据，功能性色块只用于摘要和行动。
- **Shadow Strategy:** 默认无阴影；只按 Elevation 规则提升关键表面。
- **Border:** 普通内容使用 1px 柔和线，关键贴纸使用 2px 墨绿线。
- **Internal Padding:** 手机 16px，桌面 20–24px。

### Inputs / Fields

- **Style:** 暖纸白背景、1.5px 柔和墨线、12px 圆角。
- **Focus:** 边框转墨绿并出现 3px 雾霾蓝焦点环。
- **Error / Disabled:** 错误同时显示文字；禁用态保留标签但降低对比度。

### Navigation

桌面保持左侧主导航和顶部工具区。当前项使用暖纸白、粗描边和短错位阴影；普通项无阴影。手机端折叠导航并保留当前工作区标签顺序。

### Progressive Disclosure Rows

JD 要求、翻译和证据使用可键盘操作的折叠行。折叠状态先显示要求、优先级和匹配状态；展开后依次显示中文翻译、匹配理由、简历证据、职业事实和原始 JD 片段。

## 6. Do's and Don'ts

### Do:

- **Do** 把“没有证据”和“需要判断”排在有证据内容之前。
- **Do** 在长列表中使用细分隔和折叠，保持首屏可扫描。
- **Do** 为删除、导出、确认和长任务提供明确反馈。
- **Do** 在手机端把正文、建议和证据拆成顺序清晰的视图。

### Don't:

- **Don't** 做以聊天框为中心、把结构化任务藏进对话的通用 AI 工具。
- **Don't** 做卡片层层嵌套、每个元素都有粗描边和阴影的幼稚贴纸界面。
- **Don't** 做信息无优先级、证据和原文一次性全部展开的拥挤后台。
- **Don't** 使用紫色渐变、玻璃拟态和模板化 SaaS 仪表盘。
- **Don't** 用颜色单独表达状态，也不要用动画装饰静态内容。
