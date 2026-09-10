-- A stored analysis remembers which language it was written in.
--
-- The Markdown export renders a run that may be weeks old. Its headings have
-- to match the language of the text underneath them, and that language is a
-- property of the run — not of whoever is reading it now. A reader who
-- switched languages after the analysis finished would otherwise get English
-- headings over Chinese findings.
--
-- Existing rows are all Chinese: the product had one output language until
-- now, so the default states what is true of them rather than guessing. New
-- rows always write the column explicitly.
--
-- The reader's language does not need to be stored anywhere else, because it
-- already reaches the cache key through `prompt_version`: the prompt names the
-- output language, so a run in one language can never satisfy a request in
-- the other. That is also why every existing run goes stale once — a second
-- output language cannot be added without re-asking the model.

alter table public.resume_jd_difference_runs
  add column output_locale text not null default 'zh-CN'
    check (output_locale in ('en', 'zh-CN'));
