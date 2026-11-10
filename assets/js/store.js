/* ==========================================================================
   数据层
   --------------------------------------------------------------------------
   对外只暴露三个方法，页面不关心数据是从 Supabase 来的还是演示数据：
     Store.submit(payload)            -> { ok, position }
     Store.list({ kind, offset })     -> { items, hasMore }
     Store.count()                    -> number
   ========================================================================== */

(function () {
  var cfg = window.APP_CONFIG || {};
  var PAGE_SIZE = cfg.PAGE_SIZE || 12;
  var hasRemote =
    !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY && !!window.supabase;

  var client = null;
  if (hasRemote) {
    try {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });
    } catch (e) {
      hasRemote = false;
    }
  }

  /* ---------------- 演示数据（未配置数据库时使用） ---------------- */

  var SEED = [];

  var DEMO_KEY = 'invite_demo_rows_v2';

  function readDemo() {
    try {
      var raw = localStorage.getItem(DEMO_KEY);
      if (!raw) {
        localStorage.setItem(DEMO_KEY, JSON.stringify(SEED));
        return SEED.slice();
      }
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : SEED.slice();
    } catch (e) {
      return SEED.slice();
    }
  }

  function writeDemo(rows) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(rows.slice(0, 300)));
    } catch (e) {}
  }

  function matchKind(row, kind) {
    if (kind === 'expect') return !!row.expect;
    if (kind === 'ai') return !!row.ai_story;
    return true;
  }

  /* ---------------- 公开接口 ---------------- */

  var Store = {
    isDemo: !hasRemote,
    client: client,

    async submit(payload) {
      var row = {
        nickname: payload.nickname || '匿名同学',
        grade: payload.grade || null,
        expect: payload.expect || null,
        ai_story: payload.ai_story || null,
      };

      if (!hasRemote) {
        var rows = readDemo();
        var item = Object.assign({}, row, {
          id: 'local_' + Date.now(),
          created_at: Date.now(),
        });
        rows.unshift(item);
        writeDemo(rows);
        return { ok: true, position: rows.length };
      }

      // 不加 .select()：访客没有读表的权限，加了会被 RLS 拒绝
      var res = await client.from('responses').insert(row);
      if (res.error) throw new Error(res.error.message || '提交失败');

      var c = await client.rpc('answers_count', { p_kind: 'all' });
      return { ok: true, position: c.error ? null : Number(c.data) || null };
    },

    async list(opts) {
      var kind = (opts && opts.kind) || 'all';
      var offset = (opts && opts.offset) || 0;
      var limit = PAGE_SIZE;

      if (!hasRemote) {
        var rows = readDemo().filter(function (r) {
          return matchKind(r, kind);
        });
        var page = rows.slice(offset, offset + limit).map(function (r) {
          return {
            id: r.id,
            nickname: r.nickname,
            grade: r.grade,
            expect: r.expect,
            ai_story: r.ai_story,
            created_at:
              typeof r.created_at === 'number'
                ? new Date(r.created_at).toISOString()
                : r.created_at,
          };
        });
        return { items: page, hasMore: offset + limit < rows.length };
      }

      var res = await client.rpc('answers_feed', {
        p_limit: limit,
        p_offset: offset,
        p_kind: kind,
      });
      if (res.error) throw new Error(res.error.message || '读取失败');
      return {
        items: res.data || [],
        hasMore: (res.data || []).length === limit,
      };
    },

    async count() {
      if (!hasRemote) return readDemo().length;
      var res = await client.rpc('answers_count', { p_kind: 'all' });
      if (res.error) return null;
      return Number(res.data) || 0;
    },
  };

  window.Store = Store;
})();
