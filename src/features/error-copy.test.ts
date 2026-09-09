import { describe, expect, it } from "vitest";

import { applicationDeleteErrorCopy } from "./applications/application-delete-control";
import { resumeFileDeleteErrorCopy } from "./resume-baseline/resume-file-delete-control";
import { errorCopy as differenceErrorCopy } from "./resume-jd-difference/analysis-control";
import { uploadErrorCopy } from "./source-assets/upload-form";

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
  "AbortError",
  "409",
]);

/** Phrases that point at something outside the retry button. */
const concreteAction =
  /(上传|选择|检查|压缩|精简|刷新|登录|授权|预览|设置|更换|删除|补充|识别|连接|返回|联系)/u;
const retry = /(重试|再试|重新)/u;

const tables: [string, Record<string, string>][] = [
  ["difference", differenceErrorCopy],
  ["upload", uploadErrorCopy],
  [
    "application-delete",
    applicationDeleteErrorCopy as Record<string, string>,
  ],
  [
    "resume-file-delete",
    Object.fromEntries(
      Object.entries(resumeFileDeleteErrorCopy).map(([code, copy]) => [
        code,
        copy,
      ]),
    ),
  ],
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
