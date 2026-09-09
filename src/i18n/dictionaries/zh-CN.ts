import type { Dictionary } from "./en";

/**
 * Typed as `Dictionary`, so a missing key fails to compile and a stray one
 * does too. That is why English is the source of truth: it defines the shape,
 * and every other language has to fill it exactly.
 */
export const zhCN: Dictionary = {
  common: {
    productName: "求职搭子",
    productTagline: "求职工作台",
    verifiedAccount: "已验证账户",
    cancel: "取消",
    save: "保存",
    delete: "删除",
    retry: "重试",
    loading: "加载中…",
    language: "语言",
  },
  shell: {
    homeLink: "求职搭子首页",
    newApplication: "新建申请",
    newApplicationShort: "新建",
    primaryNavigation: "主导航",
    nav: {
      home: "首页",
      applications: "我的投递",
      profile: "职业档案",
      interview: "面试题库",
    },
    safetyTitle: "资料安全原则",
    safetyBody: "AI 写入前会先让你确认，不会静默改档案。",
    accountMenu: "账户菜单",
    accountSettings: "账户设置",
    privacySettings: "AI 与数据授权",
    signOut: "退出登录",
    localeNotSaved: "本页已切换，但没能保存到你的账户，换一台设备可能会变回去。",
  },
};
