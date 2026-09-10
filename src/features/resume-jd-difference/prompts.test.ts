import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale";

import {
  DIFFERENCE_PROMPT_VARIANTS,
  RESUME_JD_DIFFERENCE_POLICY_VERSION,
  RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
  differencePrompt,
  noEvidenceWording,
} from "./prompts";

/** Every variant in every output language: nine prompts, all held to the same contract. */
const everyPrompt = DIFFERENCE_PROMPT_VARIANTS.flatMap((variant) =>
  APP_LOCALES.map(
    (locale) => [`${variant}/${locale}`, differencePrompt(variant, locale)] as const,
  ),
);

describe("resume JD difference prompts", () => {
  it("pins independent schema and policy versions", () => {
    expect(RESUME_JD_DIFFERENCE_SCHEMA_VERSION).toBe(
      "resume-jd-difference-v4",
    );
    expect(RESUME_JD_DIFFERENCE_POLICY_VERSION).toBe(
      "resume-jd-difference-policy-v4.0",
    );
  });

  it.each(everyPrompt)(
    "%s preserves the shared product and safety contract",
    (_name, prompt) => {
      // The instructions stay Chinese in both languages. They are the tuned
      // artefact, and the provider reads them natively; only what they say
      // about the *output* language varies.
      expect(prompt.instructions).toContain("一次调用");
      expect(prompt.instructions).toContain("岗位核心判断");
      expect(prompt.instructions).toContain("词频不是唯一");
      expect(prompt.instructions).toContain("职责和业务语言");
      expect(prompt.instructions).toContain("工具、框架、云平台");
      expect(prompt.instructions).toContain("年限、数字、语言等级");
      expect(prompt.instructions).toContain("只使用已确认职业事实");
      expect(prompt.instructions).toContain("不得生成可直接粘贴");
      expect(prompt.instructions).toContain("不得虚构");
      expect(prompt.instructions).toContain("严格 JSON");
      expect(prompt.instructions).toContain("只引用编号，不复制原文");
    },
  );

  it.each(everyPrompt)(
    "%s gives the model the complete strict JSON contract",
    (_name, prompt) => {
      expect(prompt.instructions).toContain('{"mission"');
      expect(prompt.instructions).toContain('"coreCapabilities"');
      expect(prompt.instructions).toContain('"overallSummary"');
      expect(prompt.instructions).toContain('"improvement":{');
      expect(prompt.instructions).toContain(
        "所有对象只能包含示例中列出的字段",
      );
      expect(prompt.instructions).toContain(
        "jdSegmentId 必须来自输入的 JD 编号",
      );
    },
  );

  it.each(everyPrompt)(
    "%s names no field the contract dropped",
    (_name, prompt) => {
      // The `Zh` suffix promised the text was Chinese, and
      // `isPasteReadyRewrite` believed it. A prompt that still asked for
      // `problemZh` would hand the provider the old contract.
      expect(prompt.instructions).not.toMatch(/[A-Za-z]Zh"/u);
    },
  );

  it.each(APP_LOCALES)(
    "asks for %s output and the matching fixed no-evidence wording",
    (locale) => {
      const prompt = differencePrompt("p1", locale);
      const language = locale === "en" ? "英文" : "简体中文";

      expect(prompt.instructions).toContain(`所有解释和方向使用${language}`);
      // Rule 7 pins one exact sentence, and the UI matches on it. The prompt
      // and the verifier have to name the same string or one finding gets
      // phrased two ways in one document.
      expect(prompt.instructions).toContain(noEvidenceWording(locale));
    },
  );

  it("keeps the output language out of no cache key", () => {
    // The version string is what puts the language into the input hash, and
    // therefore into the idempotency key and the freshness check. Without
    // this, an English reader would be served the Chinese analysis already
    // cached for the same JD and resume.
    const versions = everyPrompt.map(([, prompt]) => prompt.version);

    expect(new Set(versions).size).toBe(versions.length);
    expect(
      DIFFERENCE_PROMPT_VARIANTS.map(
        (variant) => differencePrompt(variant, "en").version,
      ),
    ).toEqual([
      "resume-jd-difference-p1-v6.0-en",
      "resume-jd-difference-p2-v6.0-en",
      "resume-jd-difference-p3-v6.0-en",
    ]);
    expect(differencePrompt("p1", "zh-CN").version).toBe(
      "resume-jd-difference-p1-v6.0-zh-CN",
    );
  });

  it.each(everyPrompt)(
    "%s asks for segment ids rather than copied source text",
    (_name, prompt) => {
      expect(prompt.instructions).toContain("jdSegmentId");
      expect(prompt.instructions).toContain("resumeSegmentId");
      expect(prompt.instructions).toContain('"requirements":[{');
      expect(prompt.instructions).not.toContain('"jobCore"');
      expect(prompt.instructions).not.toContain('"issues"');
      expect(prompt.instructions).not.toContain('"directions"');
    },
  );
});
