-- ===========================================================================
--  活动预告站 · 数据库初始化
--  ---------------------------------------------------------------------------
--  用法：Supabase 控制台 → 左侧 SQL Editor → New query → 整段粘贴 → Run
--  管理员邮箱已填好：CHANGE_ME@example.com（要换人用，改第 2 节那一行）
--
--  权限模型：访客只能写，不能读。整张表只有管理员能看、能导出。
--  脚本可重复执行，不会清空已有数据。
-- ===========================================================================


-- ===========================================================================
--  1. 表
--     六个问题对应六列，一列一题，导出时一列对一题。
-- ===========================================================================
create table if not exists public.responses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  full_name   text not null default '未署名',   -- 姓名（真名）
  grade       text,                              -- 年级专业，如「244软件」
  want        text,   -- A 最想了解什么
  ai_story    text,   -- B 平时用 AI 做过什么有意思的事
  worry       text,   -- C 是否担心 AI 冲击编程岗位，最大顾虑
  site_idea   text,   -- D 想用 AI 搭什么类型的站点
  tool_gap    text,   -- E 最常用哪款 AI 工具、有哪些短板
  salon_wish  text    -- F 之后想开展哪些 AI 技术分享沙龙
);

comment on table  public.responses is '活动问卷回收表（六题）';


-- ===========================================================================
--  1.1 从旧版本升级（只做一次，跑第二遍会自动跳过）
--      旧表是「昵称 + 两题」。这里只**新增**列、不改名，
--      这样在页面代码切换前后，新旧两版都能正常提交，不会出现提交失败的窗口。
--      旧列（nickname / expect）先留着，确认新页面跑通后再删，见文末附录。
--      注意：列注释必须放在这一步之后，否则旧表上会因为「列不存在」整段回滚。
-- ===========================================================================
do $$
declare
  has_legacy boolean;
begin
  -- 补齐新列
  alter table public.responses add column if not exists full_name   text;
  alter table public.responses add column if not exists want        text;
  alter table public.responses add column if not exists ai_story    text;
  alter table public.responses add column if not exists worry       text;
  alter table public.responses add column if not exists site_idea   text;
  alter table public.responses add column if not exists tool_gap    text;
  alter table public.responses add column if not exists salon_wish  text;

  -- 旧数据搬到新列（旧列存在才搬）
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'responses' and column_name = 'nickname'
  ) into has_legacy;

  if has_legacy then
    -- 旧列必须允许为空：新版页面只写 full_name，不写 nickname
    alter table public.responses alter column nickname drop not null;

    update public.responses
       set full_name = nickname
     where (full_name is null or btrim(full_name) = '')
       and nickname is not null;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'responses' and column_name = 'expect'
    ) then
      update public.responses
         set want = expect
       where (want is null or btrim(want) = '')
         and expect is not null;
    end if;
  end if;
end $$;

-- 新列兜底：旧版提交时没写这一列，这里补一个默认值
update public.responses set full_name = '未署名' where full_name is null or btrim(full_name) = '';
alter table public.responses alter column full_name set default '未署名';
alter table public.responses alter column full_name set not null;

-- 以前有「是否上墙」这一列，现在页面没有公开墙了，用不上
alter table public.responses drop column if exists publish;

-- 列注释：放在新增列之后，旧表升级也能跑通
comment on column public.responses.full_name  is '姓名';
comment on column public.responses.want       is 'A 对这场活动最想了解什么';
comment on column public.responses.ai_story   is 'B 平时用 AI 做过什么有意思的事';
comment on column public.responses.worry      is 'C 是否担心 AI 冲击编程岗位及最大顾虑';
comment on column public.responses.site_idea  is 'D 想用 AI 搭什么类型的站点';
comment on column public.responses.tool_gap   is 'E 最常用的 AI 工具与短板';
comment on column public.responses.salon_wish is 'F 之后想开展哪些 AI 技术分享沙龙';


-- ===========================================================================
--  1.2 约束（前端也会校验，这里是最后一道）
-- ===========================================================================
alter table public.responses drop constraint if exists responses_len_check;
alter table public.responses
  add constraint responses_len_check check (
    char_length(full_name) between 1 and 24
    and coalesce(char_length(grade), 0) <= 30
    and coalesce(char_length(want), 0) <= 800
    and coalesce(char_length(ai_story), 0) <= 800
    and coalesce(char_length(worry), 0) <= 800
    and coalesce(char_length(site_idea), 0) <= 800
    and coalesce(char_length(tool_gap), 0) <= 800
    and coalesce(char_length(salon_wish), 0) <= 800
  );

-- 六题至少答一题，且那题不能只有两三个字。
-- 升级期间旧列还在，旧页面提交（只写 expect / ai_story）也要能通过，所以一并计入。
do $$
declare
  has_expect boolean;
  expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'responses' and column_name = 'expect'
  ) into has_expect;

  expr := 'greatest(
      coalesce(char_length(btrim(want)), 0),
      coalesce(char_length(btrim(ai_story)), 0),
      coalesce(char_length(btrim(worry)), 0),
      coalesce(char_length(btrim(site_idea)), 0),
      coalesce(char_length(btrim(tool_gap)), 0),
      coalesce(char_length(btrim(salon_wish)), 0)';

  if has_expect then
    expr := expr || ',
      coalesce(char_length(btrim(expect)), 0)';
  end if;

  expr := expr || '
    ) >= 4';

  alter table public.responses drop constraint if exists responses_min_check;
  execute 'alter table public.responses add constraint responses_min_check check (' || expr || ')';
end $$;

create index if not exists responses_created_idx
  on public.responses (created_at desc);


-- ===========================================================================
--  2. 谁是管理员
--     只改这一处：把下面的邮箱换成你的。
-- ===========================================================================
create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('CHANGE_ME@example.com');
$$;

comment on function public.is_owner() is '判断当前登录用户是否为站长本人';


-- ===========================================================================
--  3. 行级安全（RLS）
--     这是「只有我能看、只有我能导出」真正的实现位置：不是前端按钮，是数据库。
-- ===========================================================================
alter table public.responses enable row level security;

-- 任何人（含未登录访客）都可以提交
drop policy if exists "anyone_can_submit" on public.responses;
create policy "anyone_can_submit"
  on public.responses
  for insert
  to anon, authenticated
  with check (true);

-- 只有站长能读整表（导出的来源）
drop policy if exists "owner_reads_all" on public.responses;
create policy "owner_reads_all"
  on public.responses
  for select
  to authenticated
  using (public.is_owner());

-- 只有站长能改（订正写错的内容）
drop policy if exists "owner_updates" on public.responses;
create policy "owner_updates"
  on public.responses
  for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- 只有站长能删
drop policy if exists "owner_deletes" on public.responses;
create policy "owner_deletes"
  on public.responses
  for delete
  to authenticated
  using (public.is_owner());

-- 说明：anon 角色没有任何 select 策略，所以访客直接查表只会拿到 0 行。
--      页面本身也不提供任何读取入口，提交完就结束。


-- ===========================================================================
--  3.1 表级权限
--      RLS 之前还有一道门：Postgres 先看这张表给没给这个角色 GRANT，
--      没给就直接 permission denied，策略写得再对也用不上。
--      新版项目不一定自动授予，这里显式写死，别依赖默认值。
-- ===========================================================================
grant usage on schema public to anon, authenticated;

-- 访客：只能往表里插，读不了、改不了、删不了
revoke all on table public.responses from anon;
grant insert on table public.responses to anon;

-- 登录用户：先给全，实际能不能读到行仍由上面的 RLS 决定（只有站长能过）
grant select, insert, update, delete on table public.responses to authenticated;


-- ===========================================================================
--  4. 清理旧版本的公开读取接口（如果之前跑过旧脚本）
-- ===========================================================================
drop function if exists public.answers_feed(int, int, text);
drop function if exists public.answers_count(text);


-- ===========================================================================
--  5. 自检（运行完看结果，全部 OK 才算配置成功）
-- ===========================================================================
select
  '管理员邮箱' as 检查项,
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_owner'
      and pg_get_functiondef(p.oid) like '%CHANGE_ME@example.com%'
  ) then 'OK（CHANGE_ME@example.com）' else '不匹配，请看第 2 节' end as 结果
union all
select '表已建好', case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'responses'
  ) then 'OK' else 'FAIL' end
union all
select '六个问题列齐全', case when (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'responses'
      and column_name in ('want', 'ai_story', 'worry', 'site_idea', 'tool_gap', 'salon_wish')
  ) = 6 then 'OK' else 'FAIL，有列没建上' end
union all
select 'RLS 已开启', case when exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'responses' and c.relrowsecurity
  ) then 'OK' else 'FAIL' end
union all
select '访客可以提交', case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'responses'
      and policyname = 'anyone_can_submit'
  ) then 'OK' else 'FAIL' end
union all
select '访客读不到任何记录', case when not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'responses'
      and cmd = 'SELECT' and 'anon' = any(roles)
  ) then 'OK' else 'FAIL' end
union all
select '访客只有插入权限', case when
    has_table_privilege('anon', 'public.responses', 'insert')
    and not has_table_privilege('anon', 'public.responses', 'select')
  then 'OK' else 'FAIL' end;


-- ===========================================================================
--  附 1：清空测试数据（活动开始前想删掉自检记录，取消注释再运行）
-- ===========================================================================
-- truncate table public.responses restart identity;


-- ===========================================================================
--  附 2：删掉旧版遗留的两列（可选）
--        确认线上的新页面已经能正常提交之后再跑，跑完这两列就彻底没了。
--        如果你是从没建过旧表的全新项目，这两列本来就不存在，跑了也没事。
-- ===========================================================================
-- alter table public.responses drop column if exists nickname;
-- alter table public.responses drop column if exists expect;
