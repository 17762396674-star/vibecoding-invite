/* ==========================================================================
   数据层
   --------------------------------------------------------------------------
   对外只暴露一个方法，页面不关心数据是从 Supabase 来的还是本地演示数据：
     Store.submit(payload)  -> { ok: true }
   访客只能写，不能读；读全表只有管理后台能做（由数据库 RLS 决定）。
   ========================================================================== */

(function () {
  var cfg = window.APP_CONFIG || {};
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
  var DEMO_KEY = 'invite_demo_rows_v3';

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

  /* ---------------- 公开接口 ---------------- */

  var Store = {
    isDemo: !hasRemote,
    client: client,

    async submit(payload) {
      var row = {
        full_name: (payload.full_name || '').trim() || '未署名',
        grade: (payload.grade || '').trim() || null,
        want: (payload.want || '').trim() || null,
        ai_story: (payload.ai_story || '').trim() || null,
        worry: (payload.worry || '').trim() || null,
        site_idea: (payload.site_idea || '').trim() || null,
        tool_gap: (payload.tool_gap || '').trim() || null,
        salon_wish: (payload.salon_wish || '').trim() || null,
      };

      if (!hasRemote) {
        var rows = readDemo();
        rows.unshift(
          Object.assign({}, row, {
            id: 'local_' + Date.now(),
            created_at: new Date().toISOString(),
          })
        );
        writeDemo(rows);
        return { ok: true };
      }

      // 不加 .select()：访客没有读表的权限，加了会被 RLS 拒绝
      var res = await client.from('responses').insert(row);
      if (res.error) throw new Error(res.error.message || '提交失败');

      return { ok: true };
    },
  };

  window.Store = Store;
})();
