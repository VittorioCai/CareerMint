import Link from "next/link";

type ComingSoonPageProps = {
  title: string;
  description: string;
  nextStepHref?: string;
  nextStepLabel?: string;
};

export function ComingSoonPage({
  title,
  description,
  nextStepHref,
  nextStepLabel = "返回工作台",
}: ComingSoonPageProps) {
  return (
    <section className="py-4 sm:py-8">
      <div className="max-w-3xl">
        <span className="inline-flex rounded-full border border-[var(--ink)] bg-[var(--cream)] px-3 py-1 text-xs font-black">即将开放</span>
        <h1 className="heading-font mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-[var(--ink-muted)] sm:text-lg">{description}</p>
      </div>

      <div className="sticker-border sticker-shadow mt-10 max-w-3xl bg-white p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--ink)] bg-[var(--mist-blue)] text-sm font-black">→</span>
          <div>
            <h2 className="heading-font text-xl font-black">当前先把可信资料基础建好</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--ink-muted)]">职业档案会成为 JD 匹配、简历改写和面试准备的共同事实来源。功能开放后，这里的数据会直接复用。</p>
            {nextStepHref ? (
              <Link href={nextStepHref} className="button-primary mt-5 inline-flex min-h-11 items-center px-4 text-sm font-black">{nextStepLabel} <span className="ml-2">→</span></Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
