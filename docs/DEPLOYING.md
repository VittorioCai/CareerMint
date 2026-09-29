# Deploying

**Database first, then code.** Not a convention — the current `main` breaks on
the current production database if the code lands first, and the failure is not
subtle.

## Why the order is not optional

Every migration in this repository is written to be applied *before* the code
that needs it. So a deploy that runs code first spends the gap in a broken
state, and the gap is however long it takes someone to notice.

The concrete failures, as of migrations `202609100001`–`202609290002`:

| Missing on the remote | What the deployed code does |
|---|---|
| `resume_jd_difference_runs.output_locale` (003) | `toRun` parses `row.output_locale` as `undefined`, `z.enum(APP_LOCALES)` rejects it, and the repository throws `invalid-stored-resume-jd-difference`. **Every difference-analysis page 500s** — including for runs that were fine a minute earlier. |
| `create_or_get_resume_jd_difference` with 13 arguments (004) | The repository sends 13; the remote function takes 12. PostgREST answers "function does not exist". **No analysis can be started.** |
| `profiles.interface_locale` default `'en'` (001) | Nothing breaks. New accounts keep defaulting to Chinese. |
| `handle_new_user` reading `interface_locale` from user metadata (002) | Nothing breaks. A visitor's language choice at sign-up is dropped. |
| The dropped pipeline tables (005) | Nothing breaks. The code stopped reading them; the tables sit there unused. |
| `link_interview_question_to_application` still granted (`202609290001`) | Nothing breaks. A legacy RPC stays callable that should not be. |
| `resume_jd_difference_runs.resume_text_source` / `resume_text_sha256`, and the two arguments that write them (`202609290002`) | Reading still works: a row without the columns is read as the file's own text. Analysing a file that can be read still works: that call sends the same thirteen arguments as before. **Analysing a scanned resume does not**: recognised or pasted text sends fifteen, PostgREST answers "function does not exist", and the reader sees a failure they can retry but not get past. |

The reverse order — database first, code second — is safe for all of them:
`output_locale` has a default, the new RPC is additive, and nothing running
reads the dropped tables. `202609290002` replaces a function the deployed code
calls, and is safe for a different reason: the two arguments it adds have
defaults, so the thirteen-argument call still resolves to it.

## What the first deploy after `202609290002` does to stored analyses

Nothing visible, by design, but it is worth knowing why.

`input_hash` now includes the application, and the hash of any text the
browser supplied. Both change what every set of inputs hashes to, which would
ordinarily turn every stored analysis stale at once — under a notice saying
the material had changed, when it had not.

So a stored run is also recognised by what its inputs hashed to *before*
(`legacyInputHash` in `resume-jd-difference/hashes.ts`). An analysis made
before this release stays current until its JD, resume, facts, model or
language actually changes. New runs are only ever stored under the new hash.

One case is not covered. A run made from recognised or pasted text before this
release was stored under the file's hash, because the text was not part of the
key — that is the fault this fixes. It is still recognised as current, by that
same old hash. What it cannot do is say which text it was made from.

## Running it

### 1. Look at the remote migration history before pushing anything

```bash
supabase link --project-ref xhtyynngtmliuhtjagnq
supabase migration list
```

Do not skip to `db push`. `202609080001` and `202609080002` were applied by
hand as raw SQL and were never recorded in the remote migration history table.
So `db push` may try to re-run them, or refuse on a history mismatch. Read the
list, and `supabase migration repair --status applied <version>` the ones that
are already there but unrecorded.

### 2. Apply the migrations

```bash
supabase db push
```

### 3. Check the two things that would have broken

```bash
# the column exists
supabase db query --linked \
  "select output_locale from public.resume_jd_difference_runs limit 1"

# the function takes 13 arguments, not 12
supabase db query --linked \
  "select pg_get_function_identity_arguments(oid) from pg_proc
   where proname = 'create_or_get_resume_jd_difference'"
```

Both of these were the failures in the table above, so if either answers with
an error the code must not be deployed yet.

### 4. Then deploy the code

Vercel does not auto-deploy this project; deployments have been manual. So the
code lands when you say so, which is what makes this order enforceable.

## Environment variables

Changing one in Vercel does not affect anything already running. It takes a
new deployment.

Two of them must agree, and only the server log says so when they do not:

- `AI_TEXT_MODEL`
- the `model` field inside `AI_PRICE_SCHEDULE_JSON`

Every service compares them through `priceScheduleFor` in
`features/ai/pricing.ts`. When they differ the schedule is dropped and the
run's cost is recorded as `null`. The run still succeeds and the interface
shows nothing; what is left is one `ai-price-schedule-model-mismatch` error
per run in the log, naming both sides. `price-schedule-example.test.ts` keeps
`.env.example` honest as the worked example, but it cannot see Vercel — after
changing either, check the pair by hand or search the log for that error.

`AI_TEXT_MODEL` is also part of `input_hash`, so changing it makes every cached
analysis stale once. That is correct behaviour, not a bug: a run made against a
different model is a different run.

## What is not automated, and why

- **No CI deploy.** Deployments are manual, which is what lets step 1 happen.
- **No migration step in CI.** A migration that drops tables should be read by
  a person before it runs against production. `202609100005` drops eighteen.
- **`supabase db push` is not in a script.** The history drift above means the
  right next command depends on what `migration list` says.
