# CareerMint 差异分析页改版 — 设计简报

给 Claude Design 的交接材料。粘贴这份，它就不用从零猜我们的系统。

---

## 产品是什么

**求职搭子 / CareerMint** —— 面向投递海外（主要是德国）岗位的中文求职者的求职工作台。

核心承诺（`PRODUCT.md`）：*「成功标准不是生成更多文字，而是让用户快速看清下一步，同时保证每个确定性陈述都有来源、每次 AI 写入都由用户主动触发和确认。」*

不做的事：不虚构经历、不自动投递、不给「匹配度 87%」这种无法核对的分数。

## 要改的这一页

`/applications/[id]?tab=difference` —— 岗位与简历差异分析。用户已经保存了 JD、选定了一份对照简历，这一页告诉他：**这份简历和这个岗位之间差在哪**。

页面上真实存在的内容块，按当前顺序：

1. 四步进度条（保存 JD → 选择简历 → 分析 → 查看差异）
2. 页面标题 + 一句说明
3. 分析控制条（状态 chip、对照文件名、「重新分析」按钮）
4. 对照简历信息条（文件名 + 「导出 Markdown」）
5. **岗位核心判断** —— 模型对岗位核心任务的理解
6. **总体差异** —— 一段结论 + 三条要点
7. **具体差异** —— 3–18 条，每条有：中文判断、JD 原文片段、优先级（关键/重要/次要）、类型（岗位语言未对齐/缺少场景/缺少结果/…）、可展开的依据（简历原文引用、职业档案事实）
8. **岗位门槛** —— 改简历解决不了的硬性要求（如「德语 C1」），需要本人确认
9. **已经对上的内容** —— 折叠
10. 下一步 → 完善建议页

## 问题诊断

不是打磨不够，是视觉语言在对抗专业感。三个可量化的事实（从 `src/**/*.tsx` 数出来）：

| | 次数 |
|---|---|
| `font-black`（900 字重） | **338** |
| `font-semibold` + `font-medium` + `font-normal` 合计 | **95** |
| 硬投影 `shadow-[Npx_Npx_0_var(--ink)]` | **30** |
| `sticker-border` / `border-2 border-[var(--ink)]` | **47** |

具体症状：

1. **颜色不表达含义。** 一屏之内六个满宽色块（绿、蓝、黄、绿、蓝、黄）。绿不代表通过，蓝不代表信息，黄不代表待办 —— 颜色只在区分「这是第几个区块」，于是每个区块同等音量地喊。
2. **全部加粗等于没有加粗。** 338 : 95。层级只能靠颜色和边框硬撑，这是第 1 条的成因。
3. **贴纸外观。** 2px 黑描边 + 3–8px 硬投影是每个容器的默认。`DESIGN.md` 自己写着不要「卡片层层嵌套、每个元素都有粗描边和阴影的幼稚贴纸界面」—— 实现跑成了设计文档明确警告的样子。
4. **装饰假装成内容。** 「岗位核心判断」占一大块绿底，里面三个格子只写着 `01 岗位任务理解 / 02 经历证据表达 / 03 岗位语言对齐` —— 三个标签，零内容。而且编号在骗人：三条是并列发现，不存在先后。「总体差异」的三个「重点」格同理。

## 现有 token（`src/app/globals.css`，请沿用，不要另起一套）

```css
--canvas:     #fffaf2   /* 页面底色，暖白 */
--white:      #ffffff
--ink:        #293733   /* 正文，墨绿黑 */
--ink-muted:  #596761
--ink-soft:   #94a09b
--line:       #dbe0dc   /* 分隔线 */
--mint:       #bdebd7
--mint-strong:#55a982
--cream:      #fff2a8
--coral:      #ff796d
--mist-blue:  #c8ddff
--error:      #b83b36
```

字体：正文 **Inter Variable**，标题 **Nunito Sans Variable**（`.heading-font`）。两者都在 Google Fonts。

现有组件的精确数值（改版可以推翻，但要知道现在是什么）：

```css
.sticker-border { border: 2px solid var(--ink); border-radius: 16px; }
.sticker-shadow { box-shadow: 8px 8px 0 var(--ink); }
.dense-surface  { border: 1px solid var(--line); border-radius: 14px; background: var(--white); }
.status-chip    { border: 1px solid var(--ink); border-radius: 999px;
                  padding: .24rem .5rem; font-size: .68rem; font-weight: 800; line-height: 1; }
.button-primary { border: 2px solid var(--ink); border-radius: 12px;
                  background: var(--cream); box-shadow: 4px 4px 0 var(--ink); }
.button-secondary { border: 2px solid var(--ink); border-radius: 12px; background: var(--white); }
.form-input     { min-height: 3rem; border: 1.5px solid var(--ink-soft); border-radius: 12px;
                  padding: .75rem .875rem; font-size: .9375rem; }
```

## 约束

- **色板不换。** 这是既有品牌，薄荷绿/珊瑚红/奶油黄/暖白要保留。改的是使用纪律，不是颜色本身。
- **中文为主，英文混排。** JD 原文是英文且必须逐字保留（带 `lang="und"`），中文判断在旁边。字体要能同时处理好两种。
- **要有暗色模式的余地** —— 现在没有，但别把设计做死在只能亮色。
- **手机端是真实场景。** 用户在桌面端整理 JD、在手机端查看。差异列表在 390px 宽下必须可读。
- **无障碍**：状态不能只靠颜色区分，必须有文字或符号（`DESIGN.md` 明确要求）。触控目标 ≥ 44px。

## 已有参考

- 现状截图与我的初版提案：https://claude.ai/code/artifact/e2a12c62-287f-4d99-8747-7e6f4038436e
- 设计原则与禁忌：仓库根目录 `DESIGN.md`
- 产品定位：仓库根目录 `PRODUCT.md`

## 真实内容（做 mockup 请用这些，不要 lorem）

JD 片段：
> Lead product discovery for a European marketplace team. Measure customer outcomes with SQL and dashboards. Work with business stakeholders across three markets. German C1 is required.

三条差异：
- 岗位语言未对齐（关键）— "Lead product discovery for a European marketplace team."
- 缺少具体业务场景（重要）— "Measure customer outcomes with SQL and dashboards." — 档案依据：跨部门业务复盘
- 缺少可验证的结果（次要）— "Work with business stakeholders across three markets."

一条岗位门槛：德语 C1（关键，改简历无法解决）

一条已匹配：分析业务数据 — 简历原文 "Analyzed weekly user data."

公司 Northstar GmbH · 职位 Product Analyst · 对照简历 resume-en.pdf
