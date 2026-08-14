import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OnboardingForm } from "./onboarding-form";

describe("OnboardingForm", () => {
  it("saves goals, allows upload to be skipped, and completes only explicitly", async () => {
    const user = userEvent.setup();
    const savePreferences = vi.fn().mockResolvedValue({ ok: true });
    const completeOnboarding = vi.fn().mockResolvedValue({ ok: true });
    render(
      <OnboardingForm
        initialPreferences={{
          displayName: "",
          interfaceLocale: "zh-CN",
          timezone: "Europe/Berlin",
          targetRole: "",
          targetCountries: [],
          jobSearchLanguage: "en",
          aiProcessingAllowed: false,
        }}
        factCount={1}
        savePreferences={savePreferences}
        completeOnboarding={completeOnboarding}
      />,
    );

    expect(screen.getByRole("heading", { name: "求职目标" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "上传简历" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "核对事实" })).toBeVisible();

    await user.type(screen.getByLabelText("姓名"), "Lin Chen");
    await user.type(screen.getByLabelText("目标岗位"), "Product Analyst");
    await user.type(screen.getByLabelText("目标国家"), "Germany, Netherlands");
    await user.click(screen.getByRole("button", { name: "保存求职目标" }));
    expect(savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Lin Chen",
        targetRole: "Product Analyst",
        targetCountries: ["Germany", "Netherlands"],
        aiProcessingAllowed: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "暂时跳过" }));
    expect(completeOnboarding).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "进入工作台" }));
    expect(completeOnboarding).toHaveBeenCalledOnce();

    expect(savePreferences).toHaveBeenCalledTimes(1);
  });
});
