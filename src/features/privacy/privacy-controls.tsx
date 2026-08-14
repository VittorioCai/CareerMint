"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PrivacyControls() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeAccount() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (response.status === 204) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const code =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : "";
      setError(
        code === "storage-delete-incomplete"
          ? "部分私有文件尚未删除，账户仍然保留。请稍后重试。"
          : "账户删除没有完成，请稍后重试。",
      );
    } catch {
      setError("网络连接中断，账户没有被删除。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="dense-surface p-5 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">数据可携带</p>
        <h2 className="heading-font mt-2 text-2xl font-black">下载全部数据</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          ZIP 包含账户档案、职业事实、文件元数据和你上传的原始简历，不包含内部存储路径或系统密钥。
        </p>
        <a href="/api/account/export" className="button-primary mt-5 inline-flex min-h-11 items-center px-5 text-sm font-black">
          下载全部数据
        </a>
      </section>

      <section className="rounded-2xl border border-[var(--coral)] bg-white p-5 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--error)]">危险操作</p>
        <h2 className="heading-font mt-2 text-2xl font-black">永久删除账户</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
          将先删除全部私有文件，再删除登录账户；数据库中的档案、事实和任务随账户级联删除。此操作不可恢复。
        </p>
        <button type="button" className="mt-5 min-h-11 rounded-xl border-2 border-[var(--error)] px-5 text-sm font-black text-[var(--error)]" onClick={() => setDialogOpen(true)}>
          删除我的账户
        </button>
      </section>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[color:var(--ink)]/40 p-4">
          <section role="dialog" aria-modal="true" aria-label="确认删除账户" className="sticker-border w-full max-w-lg bg-white p-5 shadow-[6px_6px_0_var(--ink)] sm:p-7">
            <h2 className="heading-font text-2xl font-black">确认永久删除</h2>
            <p className="mt-3 text-sm font-medium leading-6 text-[var(--ink-muted)]">
              输入 <strong className="text-[var(--ink)]">DELETE</strong> 才能继续。关闭窗口不会执行任何操作。
            </p>
            <label className="mt-5 block text-sm font-black">
              确认文字
              <input className="form-input mt-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            {error ? <p role="alert" className="mt-4 text-sm font-bold text-[var(--error)]">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="button-secondary min-h-10 px-4 text-sm font-black" disabled={busy} onClick={() => setDialogOpen(false)}>取消</button>
              <button type="button" className="min-h-10 rounded-xl bg-[var(--error)] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={confirmation !== "DELETE" || busy} onClick={() => void removeAccount()}>
                {busy ? "正在删除…" : "永久删除账户"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
