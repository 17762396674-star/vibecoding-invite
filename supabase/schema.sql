-- ===========================================================================
--  活动预告站 · 数据库初始化
--  ---------------------------------------------------------------------------
--  用法：Supabase 控制台 → 左侧 SQL Editor → New query → 整段粘贴 → Run
--  只改一处：第 2 节里的管理员邮箱，换成你自己的。
--
--  权限模型：访客只能写，不能读。整张表只有管理员能看、能导出。
-- ===========================================================================


-- ===========================================================================
--  1. 表
-- ===========================================================================
create table if not exists public.responses (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname   text not null default '匿名同学',
  grade      text,
  expect     text,          -- 问卷 A：对活动的期待
  ai_story   text           -- 问卷 B：AI 故事
);

comment on table  public.responses is '活动问卷回收表';

-- 兼容旧版本：以前有「是否上墙」这一列，现在页面没有公开墙了，用不上
alter table public.responses drop column if exists publish;

-- 约束：挡住空提交和超长内容（前端也会校验，这里是最后一道）
alter table public.responses drop constraint if exists responses_len_check;
alter table public.responses
  add constraint responses_len_check check (
    char_length(nickname) between 1 and 24
    and coalesce(char_length(grade), 0) <= 30
    and coalesce(char_length(expect), 0) <= 800
    and coalesce(char_length(ai_story), 0) <= 800
  );

alter table public.responses drop constraint if exists responses_min_check;
alter table public.responses
  add constraint responses_min_check check (
    coalesce(char_length(btrim(expect)), 0) >= 0
    and coalesce(char_length(btrim(ai_story)), 0) >= 0
    and (
      coalesce(char_length(btrim(expect)), 0) >= 4
      or coalesce(char_length(btrim(ai_story)), 0) >= 4
    )
  );

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
  '管理员邮箱已替换' as 检查项,
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_owner'
      and pg_get_functiondef(p.oid) not like '%CHANGE_ME%'
  ) then 'OK' else '还没改！请回到第 2 节换成你的邮箱' end as 结果
union all
select '表已建好', case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'responses'
  ) then 'OK' else 'FAIL' end
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
--  附：想清空测试数据时，取消下面这行的注释再运行
-- ===========================================================================
-- truncate table public.responses restart identity;
