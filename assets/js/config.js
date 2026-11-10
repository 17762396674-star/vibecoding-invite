/* ==========================================================================
   配置
   --------------------------------------------------------------------------
   ① 在 supabase.com 建一个项目
   ② 按 supabase/schema.sql 建表
   ③ 把下面的 URL 和 anon key 填进来（Project Settings → API）
   ④ 保存后刷新页面，顶部「演示模式」提示条会自动消失

   这两个值是公开的（anon key 只代表「谁在访问」，本身没有权限），
   真正的权限写在数据库的 RLS 策略里。不要往这里放 service_role key。
   ========================================================================== */

window.APP_CONFIG = {
  SUPABASE_URL: "https://pwnoeaqpbsatacyhkrjx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_lDvQLk3nIeG3Sfo5hx9ecQ_Ql9N_cXs",

  // 单个回答的最大字数（与数据库约束保持一致）
  MAX_LEN: 800,
};
