import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zhCN } from "@/i18n/dictionaries/zh-CN";

import { applicationDeleteMessage } from "./applications/application-delete-control";
import { draftErrorMessage } from "./applications/application-draft-form";
import { stageUpdateMessage } from "./applications/stage-update-form";
import { resumeFileDeleteErrorCopy } from "./resume-baseline/resume-file-delete-control";
import { accountDeleteErrorCopy } from "./privacy/privacy-controls";
import { errorCopy as differenceErrorCopy } from "./resume-jd-difference/analysis-control";
import { uploadErrorMessage } from "./source-assets/upload-form";

/**
 * Every failure message names something the reader can do.
 *
 * The weak version of this rule — "the string contains 请 or 重试" — passes
 * "分析没有完成，请重新尝试。", which is the message that prompted the rule. It
 * says the thing failed and offers to fail again, without saying why or what
 * to change first.
 *
 * So a bare retry has to be *earned*. A code is transient when trying again
 * with the same input is genuinely the right advice: a timeout, a rate limit,
 * a service that is briefly down. Everything else has to name the thing to
 * change — the file, the selection, the setting, the connection.
 *
 * The table is the specification. A new error code fails this test until
 * someone decides which kind it is, which is the point.
 */

/** Trying again unchanged is honest advice for these. */
const transient = new Set([
  "ai-timeout",
  "ai-rate-limited",
  "ai-request-failed",
  "ai-provider-authentication-failed",
  "resume-jd-difference-request-failed",
  "resume-jd-difference-invalid-output",
  "resume-jd-difference-evidence-invalid",
  "resume-extraction-request-failed",
  "source-download-failed",
  "download-failed",
  "upload-failed",
  "application-storage-error",
  "application-action-failed",
  // Both account-deletion failures are genuinely "try again": the request
  // reached the server and something downstream did not finish. Listed here
  // rather than left to the phrase check, which would have passed them on the
  // word "deleted" — a word about what failed, not about what to do.
  "storage-delete-incomplete",
  "account-delete-failed",
  "AbortError",
  "409",
]);

/**
 * Phrases that point at something outside the retry button.
 *
 * Both languages, because the rule is about what the reader can do and every
 * reader gets one language or the other. Writing it for Chinese only was the
 * first version, and it passed every English message without reading it.
 */
const concreteAction =
  /(上传|选择|检查|压缩|精简|刷新|登录|授权|预览|设置|更换|删除|补充|识别|连接|返回|联系)|\b(upload|select|pick|choose|check|compress|trim|reload|sign in|authoris|authoriz|preview|settings|replace|delete|add|recognis|recogniz|connection|back to|contact|confirm|save as|export|leave it out|fill in|entered|different)/iu;
const retry = /(重试|再试|重新)|\b(try again|retry|again in a moment)/iu;

/**
 * The codes each resolver answers.
 *
 * Listed here rather than derived, because deriving them from the resolver
 * would make this test agree with whatever the resolver happens to handle.
 * A new code has to be added here, which is the prompt to decide whether a
 * bare retry is honest advice for it.
 */
const APPLICATION_DELETE_CODES = [
  "application-not-found",
  "deletion-confirmation-required",
  "invalid-input",
  "application-storage-error",
  "application-action-failed",
] as const;

const APPLICATION_DRAFT_CODES = [
  "invalid-input",
  "invalid-application-input",
  "application-storage-error",
  "application-action-failed",
] as const;

const STAGE_UPDATE_CODES = [
  "application-stage-unchanged",
  "application-not-found",
  "invalid-input",
  "invalid-application-input",
  "application-storage-error",
  "application-action-failed",
] as const;

/**
 * Every code `uploadErrorMessage` answers.
 *
 * Uploading a file and picking a baseline share the table because the baseline
 * picker uploads too, so the four application-action codes belong here as well.
 */
const UPLOAD_CODES = [
  "empty-file",
  "file-too-large",
  "unsupported-content-type",
  "unsupported-file-signature",
  "content-type-mismatch",
  "missing-file",
  "unauthorized",
  "upload-failed",
  "resume-extraction-request-failed",
  "resume-text-too-short",
  "resume-ocr-too-many-pages",
  "resume-ocr-unavailable",
  "ocr-request-too-large",
  "ai-provider-authentication-failed",
  "AbortError",
  "invalid-input",
  "application-or-resume-not-found",
  "application-storage-error",
  "application-action-failed",
] as const;

const tables: [string, Record<string, string>][] = [
  ["difference", differenceErrorCopy],
  // The localized tables are built by calling the resolver for every code it
  // knows, once per language: a message that only reads well in one of them is
  // still a message that fails this rule for half the readers.
  ...(
    [
      ["en", en],
      ["zh-CN", zhCN],
    ] as const
  ).flatMap(([language, dictionary]): [string, Record<string, string>][] => [
    [
      `upload (${language})`,
      Object.fromEntries(
        UPLOAD_CODES.map((code) => [
          code,
          uploadErrorMessage(code, dictionary.resume),
        ]),
      ),
    ],
    [
      `resume-file-delete (${language})`,
      resumeFileDeleteErrorCopy(dictionary.resume.errors),
    ],
    [
      `account-delete (${language})`,
      accountDeleteErrorCopy(dictionary.settings.errors),
    ],
    [
      `application-delete (${language})`,
      Object.fromEntries(
        APPLICATION_DELETE_CODES.map((code) => [
          code,
          applicationDeleteMessage(code, dictionary.applications),
        ]),
      ),
    ],
    [
      `application-draft (${language})`,
      Object.fromEntries(
        APPLICATION_DRAFT_CODES.map((code) => [
          code,
          draftErrorMessage(code, dictionary.applications.draft),
        ]),
      ),
    ],
    [
      `stage-update (${language})`,
      Object.fromEntries(
        STAGE_UPDATE_CODES.map((code) => [
          code,
          stageUpdateMessage(code, dictionary.applications.stageUpdate),
        ]),
      ),
    ],
  ]),
];

describe("error copy", () => {
  for (const [name, table] of tables) {
    describe(name, () => {
      it("offers an action in every message", () => {
        const silent = Object.entries(table).filter(
          ([, copy]) => !concreteAction.test(copy) && !retry.test(copy),
        );
        expect(silent, `${silent.map(([code]) => code).join(", ")}`).toEqual([]);
      });

      it("only falls back to a bare retry where retrying is the advice", () => {
        const lazy = Object.entries(table).filter(
          ([code, copy]) =>
            !transient.has(code) && !concreteAction.test(copy),
        );
        expect(
          lazy.map(([code, copy]) => `${code}: ${copy}`),
          "these say the thing failed without saying what to change",
        ).toEqual([]);
      });

      it("says something, not just what to do", () => {
        // A message that is only an instruction leaves the reader guessing at
        // what went wrong. Eight characters is not a rule about length; it is
        // a floor below which nothing has been explained.
        const bare = Object.entries(table).filter(
          ([, copy]) => copy.replaceAll(/[，。、]/gu, "").length < 8,
        );
        expect(bare.map(([code]) => code)).toEqual([]);
      });
    });
  }
});
