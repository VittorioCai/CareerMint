# CareerMint 本地简历 OCR 设计

## 目标

让 CareerMint 能处理没有文本层的扫描 PDF 简历，同时保持 OCR 本身零按次费用。默认采用百度开源的 PP-OCRv6 Small，并在用户浏览器内完成识别；原始 PDF 页面不会发送给百度或其他 OCR 服务。

## 范围

- 保留现有 PDF.js 原生文本提取作为首选路径。
- 仅当服务端原生提取返回 `resume-text-too-short` 时启动 OCR。
- OCR 仅支持 PDF；DOCX 继续走现有 Mammoth 解析路径。
- 使用 `@paddleocr/paddleocr-js`、PP-OCRv6 Small、Web Worker 和 WASM/可用的浏览器加速能力。
- OCR 输出仍需经过现有 DeepSeek 事实提取、证据校验和用户确认流程。
- 本次不接入百度智能云 OCR 或千问 OCR API；将来可作为用户主动选择的高精度降级通道。

## 用户流程

1. 用户选择 PDF/DOCX 并上传，原文件先保存到私有 Supabase Storage。
2. 应用启动现有服务端解析和 AI 建档任务。
3. 文本型 PDF 和 DOCX 按原流程完成，不下载 OCR 模型。
4. 扫描 PDF 因原生文字不足失败时，页面显示“正在本地识别扫描版简历”，按页展示进度。
5. 浏览器使用 PDF.js 将页面渲染为图像，再由 PP-OCRv6 Small 识别。
6. 识别结果在服务端再次执行长度校验，然后进入现有 DeepSeek 事实提取流程。
7. OCR 或后续 AI 失败时保留已上传文件；同页重试不重复上传，已经得到的 OCR 文本可复用。

## 架构

### 客户端 OCR

新增独立的浏览器模块，只有扫描 PDF 触发时才动态导入，避免影响普通页面首屏包体。模块负责：

- 读取本地 `File`；
- 通过 PDF.js 逐页渲染；
- 懒加载 PP-OCRv6 Small；
- 在 Worker 中运行识别；
- 按页面返回进度；
- 按阅读顺序合并有足够置信度的文字；
- 支持 `AbortSignal` 取消；
- 限制最多识别 10 页，防止异常 PDF 消耗过多浏览器内存。

模型权重和运行库可以从官方静态资源地址下载并由浏览器缓存。下载模型不等于上传简历；PDF 像素和识别文字只保留在 CareerMint 页面进程中，直至用户将 OCR 文字提交给 CareerMint 自己的后端。

### 服务端接收 OCR 文字

现有 `POST /api/source-assets/:id/extract` 增加可选 JSON 字段 `ocrText`：

- 没有 `ocrText` 时继续下载原文件并解析；
- 有 `ocrText` 时使用统一的 `normalizeResumeText` 校验 40–100,000 字符；
- OCR 路径使用独立幂等键 `source-asset:{id}:resume-extract:ocr:v1`，避免复用已失败的原生解析任务，同时保证重复提交不会重复调用 DeepSeek；
- 仍然先校验账户、资源所有权和 AI 数据授权；
- 任务结果和日志不得存储完整 OCR 文本。

### UI 状态

上传组件增加 `ocr` 状态和按页进度。OCR 期间文件输入与提交按钮保持禁用，提供“取消本地识别”。错误文案区分：

- PDF 页数超过本地 OCR 上限；
- 浏览器不支持或模型加载失败；
- OCR 后文字仍然不足；
- OCR 已完成但 DeepSeek 未配置/不可用。

所有状态通过文字和 `aria-live` 表达，不只依赖颜色。

## 事实安全与隐私

- OCR 只负责转写，不把识别结果直接写入职业档案。
- DeepSeek 仍只能从 OCR 原文中提取候选事实，现有证据片段校验继续生效。
- 候选事实仍需用户确认后才能成为确定性职业事实。
- 不在普通日志、任务结果或错误消息中写入 OCR 全文。
- 不把 PDF 页面发送给百度；第三方请求仅用于下载公开模型资源。

## 成本

- PaddleOCR 代码和模型使用 Apache 2.0 许可证，没有 OCR 按次费用。
- 浏览器承担 OCR 算力；CareerMint 只承担模型静态资源流量（使用官方资源时主要由官方 CDN 承担）。
- OCR 完成后的 DeepSeek 结构化分析仍按现有 token 计费，并受用户 AI 数据授权控制。

## 验收标准

- 普通文本 PDF 不加载 PaddleOCR，原流程无回归。
- 扫描 PDF 自动切换到本地 PP-OCRv6 Small，并显示确定的页数进度。
- OCR 文本通过独立幂等任务进入事实提取，重复重试不重复扣费。
- 取消、页数超限、模型加载失败和 OCR 文字不足都有明确反馈。
- PDF 原始像素不发送给第三方 OCR API。
- 单元测试、组件测试、类型检查、Lint 和生产构建全部通过。
