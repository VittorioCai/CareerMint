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
      expect(prompt.instructions).toContain("学科大类和业务语言");
      expect(prompt.instructions).toContain("工具、框架、云平台");
      expect(prompt.instructions).toContain("年限、数字、语言等级");
      expect(prompt.instructions).toContain("comparisonMode");
      expect(prompt.instructions).toContain("strict 只有在简历引用中出现所有关键原词");
      expect(prompt.instructions).toContain("只使用已确认职业事实");
      expect(prompt.instructions).toContain("当前材料未找到相关证据");
      expect(prompt.instructions).toContain("不得生成可直接粘贴");
      expect(prompt.instructions).toContain("不得虚构");
      expect(prompt.instructions).toContain("严格 JSON");
      expect(prompt.instructions).toContain(
        "输入中真实存在的 jdSegmentId、resumeSegmentId",
      );
    },
  );

  it.each(Object.entries(differencePromptVariants))(
    "%s gives the model the complete strict JSON contract",
    (_name, prompt) => {
      expect(prompt.instructions).toContain(
        '{"missionZh":"中文岗位使命"',
      );
      expect(prompt.instructions).toContain(
        '"overallSummaryZh":"中文总体差异判断"',
      );
      expect(prompt.instructions).toContain('"requirements":[{"jdSegmentId":"jd-1"');
      expect(prompt.instructions).toContain('"assessment":"partial"');
      expect(prompt.instructions).toContain('"improvement":{"targetSection"');
      expect(prompt.instructions).toContain(
        "所有对象只能包含示例中列出的字段",
      );
      expect(prompt.instructions).toContain(
        "非门槛项必须填写 improvement",
      );
      expect(prompt.instructions).toContain(
        "返回前静默核对引用编号",
      );
    },
  );

  it("keeps prompt variants independently versioned", () => {
    expect(new Set(Object.values(differencePromptVariants).map(({ version }) => version)).size)
      .toBe(3);
    expect(Object.values(differencePromptVariants).map(({ version }) => version))
      .toEqual([
        "resume-jd-difference-p1-v5.0",
        "resume-jd-difference-p2-v5.0",
        "resume-jd-difference-p3-v5.0",
      ]);
  });
});
