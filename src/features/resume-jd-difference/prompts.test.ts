import { describe, expect, it } from "vitest";

import {
  RESUME_JD_DIFFERENCE_POLICY_VERSION,
  RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
  differencePromptVariants,
} from "./prompts";

describe("resume JD difference prompts", () => {
  it("pins independent schema and policy versions", () => {
    expect(RESUME_JD_DIFFERENCE_SCHEMA_VERSION).toBe(
      "resume-jd-difference-v4",
    );
    expect(RESUME_JD_DIFFERENCE_POLICY_VERSION).toBe(
      "resume-jd-difference-policy-v4.0",
    );
  });

  it.each(Object.entries(differencePromptVariants))(
    "%s preserves the shared product and safety contract",
    (_name, prompt) => {
      expect(prompt.instructions).toContain("一次调用");
      expect(prompt.instructions).toContain("岗位核心判断");
      expect(prompt.instructions).toContain("词频不是唯一");
      expect(prompt.instructions).toContain("职责和业务语言");
      expect(prompt.instructions).toContain("工具、框架、云平台");
      expect(prompt.instructions).toContain("年限、数字、语言等级");
      expect(prompt.instructions).toContain("只使用已确认职业事实");
      expect(prompt.instructions).toContain("当前材料未找到相关证据");
      expect(prompt.instructions).toContain("不得生成可直接粘贴");
      expect(prompt.instructions).toContain("不得虚构");
      expect(prompt.instructions).toContain("严格 JSON");
    },
  );

  it("keeps prompt variants independently versioned", () => {
    expect(new Set(Object.values(differencePromptVariants).map(({ version }) => version)).size)
      .toBe(3);
  });
});
