"use client";

import { type FormEvent, useState } from "react";

import type { CareerFactInput } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function ManualFactForm({
  createFact,
}: {
  createFact(input: CareerFactInput): ActionResult;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await createFact({
      factType: String(form.get("factType")) as CareerFactInput["factType"],
      data: {
        title: String(form.get("title")),
        organization: String(form.get("organization")) || null,
        startDate: String(form.get("startDate")) || null,
        endDate: String(form.get("endDate")) || null,
        description: String(form.get("description")),
        skills: String(form.get("skills"))
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      },
    });
    setBusy(false);
    if (result.ok) setOpen(false);
    else setError("内容没有保存，请检查必填项和日期格式。");
  }

  if (!open) {
    return (
      <button type="button" className="button-primary min-h-11 px-5 text-sm font-black" onClick={() => setOpen(true)}>
        ＋ 手动添加事实
      </button>
    );
  }

  return (
    <form className="dense-surface mt-4 grid gap-4 p-5 sm:grid-cols-2" onSubmit={submit}>
      <div className="sm:col-span-2">
        <h2 className="heading-font text-xl font-black">新增职业事实</h2>
        <p className="mt-1 text-xs font-medium text-[var(--ink-muted)]">手动事实也从“待确认”开始。</p>
      </div>
      <label className="block text-sm font-black">
        类型
        <select name="factType" className="form-input mt-2" defaultValue="skill">
          <option value="summary">个人总结</option>
          <option value="work_experience">工作经历</option>
          <option value="education">教育</option>
          <option value="project">项目</option>
          <option value="skill">技能</option>
          <option value="certification">证书</option>
          <option value="language">语言</option>
          <option value="achievement">量化成果</option>
          <option value="story">STAR 故事</option>
        </select>
      </label>
      <label className="block text-sm font-black">
        标题
        <input name="title" className="form-input mt-2" required />
      </label>
      <label className="block text-sm font-black">
        组织 / 公司
        <input name="organization" className="form-input mt-2" />
      </label>
      <label className="block text-sm font-black">
        技能（逗号分隔）
        <input name="skills" className="form-input mt-2" />
      </label>
      <label className="block text-sm font-black">
        开始时间
        <input name="startDate" className="form-input mt-2" placeholder="YYYY 或 YYYY-MM" />
      </label>
      <label className="block text-sm font-black">
        结束时间
        <input name="endDate" className="form-input mt-2" placeholder="留空代表至今" />
      </label>
      <label className="block text-sm font-black sm:col-span-2">
        描述
        <textarea name="description" className="form-input mt-2 min-h-28 resize-y" required />
      </label>
      {error ? <p role="alert" className="text-sm font-bold text-[var(--error)] sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="button-primary min-h-10 px-4 text-sm font-black" disabled={busy}>{busy ? "保存中…" : "保存为待确认"}</button>
        <button type="button" className="button-secondary min-h-10 px-4 text-sm font-black" onClick={() => setOpen(false)}>取消</button>
      </div>
    </form>
  );
}
