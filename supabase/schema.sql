-- ===========================================================================
--  活动预告站 · 数据库初始化
--  ---------------------------------------------------------------------------
--  用法：Supabase 控制台 → 左侧 SQL Editor → New query → 整段粘贴 → Run
--  运行前只需要改一处：下面这一行，换成你自己的管理员邮箱。
-- ===========================================================================

-- ① 先把这一行改成你的管理员邮箱（就是你会用来登录 admin.html 的那个）
--    例如：'president@example.com'
--    注意：改完这一行之后，再运行整段 SQL。



-- ===========================================================================
--  1. 表
-- ===========================================================================
create table if not exists public.responses (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname   text not null default '匿名同学',
  grade      text,
  expect     text,          -- 问卷 A：对活动的期待
  ai_story   text,          -- 问卷 B：AI 故事
  contact    text,          -- 联系方式：永不公开，仅管理员
  publish    boolean not null default true
);

comment on table  public.responses is '活动问卷回收表';
comment on column public.responses.contact is '联系方式：不进入公开 RPC，只有管理员可读';

-- 约束：挡住空提交和超长内容（前端也会校验，这里是最后一道）
alter table public.responses drop constraint if exists responses_len_check;
alter table public.responses
  add constraint responses_len_check check (
    char_length(nickname) between 1 and 24
    and coalesce(char_length(grade), 0) <= 30
    and coalesce(char_length(expect), 0) <= 800
    and coalesce(char_length(ai_story), 0) <= 800
    and coalesce(char_length(contact), 0) <= 60
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
create index if not exists responses_publish_idx
  on public.responses (publish, created_at desc);


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
--     这是「只有我能导出」真正的实现位置：不是前端按钮，是数据库。
-- ===========================================================================
alter table public.responses enable row level security;

-- 任何人（含未登录访客）都可以提交，但只能提交「公开状态」的记录
drop policy if exists "anyone_can_submit" on public.responses;
create policy "anyone_can_submit"
  on public.responses
  for insert
  to anon, authenticated
  with check (publish = true);

-- 只有站长能读整表（含联系方式、含未公开记录）
drop policy if exists "owner_reads_all" on public.responses;
create policy "owner_reads_all"
  on public.responses
  for select
  to authenticated
  using (public.is_owner());

-- 只有站长能改（隐藏 / 恢复）
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

-- 说明：anon 角色没有任何 select 策略，所以访客直接查表会被拒绝。


-- ===========================================================================
--  4. 公开读取接口
--     访客不能查表，但可以调用这两个函数。函数以定义者身份执行，
--     绕过 RLS，并且只返回「可以公开」的列 —— contact 不在返回列里。
-- ===========================================================================
create or replace function public.answers_feed(
  p_limit  int  default 12,
  p_offset int  default 0,
  p_kind   text default 'all'
)
returns table (
  id         uuid,
  nickname   text,
  grade      text,
  expect     text,
  ai_story   text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.nickname, r.grade, r.expect, r.ai_story, r.created_at
  from public.responses r
  where r.publish = true
    and (
      coalesce(p_kind, 'all') = 'all'
      or (p_kind = 'expect' and coalesce(btrim(r.expect), '') <> '')
      or (p_kind = 'ai'     and coalesce(btrim(r.ai_story), '') <> '')
    )
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.answers_count(
  p_kind text default 'all'
)
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::bigint
  from public.responses r
  where r.publish = true
    and (
      coalesce(p_kind, 'all') = 'all'
      or (p_kind = 'expect' and coalesce(btrim(r.expect), '') <> '')
      or (p_kind = 'ai'     and coalesce(btrim(r.ai_story), '') <> '')
    );
$$;

revoke all on function public.answers_feed(int, int, text) from public;
revoke all on function public.answers_count(text) from public;
grant execute on function public.answers_feed(int, int, text) to anon, authenticated;
grant execute on function public.answers_count(text) to anon, authenticated;


-- ===========================================================================
--  5. 自检（运行完看结果，全部 should_be 都对才算配置成功）
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
select '访客写入策略存在', case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'responses'
      and policyname = 'anyone_can_submit'
  ) then 'OK' else 'FAIL' end
union all
select '公开接口已授权', case when has_function_privilege(
    'anon', 'public.answers_feed(int,int,text)', 'execute'
  ) then 'OK' else 'FAIL' end;


-- ===========================================================================
--  附：想清空测试数据时，取消下面两行的注释再运行
-- ===========================================================================
-- truncate table public.responses restart identity;
