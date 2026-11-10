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

  var SEED = [
    {
      id: 'd1',
      nickname: '计科 2 班 · 阿泽',
      grade: '大二 · 计算机',
      expect:
        '我最想知道的是：没有服务器、没有数据库，能不能做出一个有登录的页面。如果不能，那条线到底在哪儿。',
      ai_story: null,
      created_at: Date.now() - 1000 * 60 * 26,
    },
    {
      id: 'd2',
      nickname: '小林',
      grade: '大一 · 软件工程',
      expect: null,
      ai_story:
        '让 AI 把我高中三年写的日记按主题重新排了一遍，出了个小册子送给我妈。她以为是打印店做的。',
      created_at: Date.now() - 1000 * 60 * 52,
    },
    {
      id: 'd3',
      nickname: '老陈',
      grade: '大三 · 电子信息',
      expect:
        '传到 GitHub 就白屏，卡了两周了。图片全裂，样式全没。我到现在都不知道错在哪一层，希望现场能帮我看看。',
      ai_story:
        '做过一个特别土的事：把实验室师兄的语音转成文字，再用 AI 整理成会议纪要，一学期的组会记录全是我出的。',
      created_at: Date.now() - 1000 * 60 * 60 * 3,
    },
    {
      id: 'd4',
      nickname: '一只鸽子',
      grade: '大二 · 数媒',
      expect:
        '想知道做个人作品集，是应该用现成模板还是从零开始。我怕模板一眼就被看出来。',
      ai_story:
        '把自己的画拍照丢给 AI，让它描述风格，再反过来给我生成配色方案。它说我爱用低饱和的灰绿，我自己都没发现。',
      created_at: Date.now() - 1000 * 60 * 60 * 8,
    },
    {
      id: 'd5',
      nickname: '匿名同学',
      grade: '',
      expect:
        '社团招新主页下周就要用，我今晚必须做出一个能发出去的链接。最怕的是做一半卡住没人问。',
      ai_story: null,
      created_at: Date.now() - 1000 * 60 * 60 * 20,
    },
    {
      id: 'd6',
      nickname: '周周',
      grade: '大四 · 计算机',
      expect:
        '快毕业了，想知道 AI 到底会不会让前端这个方向没饭吃。想听点具体的，不想听「拥抱变化」。',
      ai_story:
        '实习的时候让 AI 把一坨没有注释的祖传代码画成了流程图，我靠那张图才看懂我在改什么。',
      created_at: Date.now() - 1000 * 60 * 60 * 30,
    },
    {
      id: 'd7',
      nickname: 'Kevin',
      grade: '大一 · 人工智能',
      expect: '想知道要装什么软件。上次装 Node 装了一下午，最后放弃了。',
      ai_story:
        '用 AI 给我妈解释什么叫「大模型」，它写了一版菜谱式的比喻，我妈居然听懂了，还问我能不能教她。',
      created_at: Date.now() - 1000 * 60 * 60 * 44,
    },
    {
      id: 'd8',
      nickname: '小满',
      grade: '大二 · 汉语言',
      expect:
        '文科生来听会不会完全听不懂？我只会用 Word，不会写代码，但我想给自己的公众号做个主页。',
      ai_story:
        '让 AI 帮我整理了一年的读书笔记，它把 47 本书按我没想到的方式连成了三条线索。那天我看了一晚上。',
      created_at: Date.now() - 1000 * 60 * 60 * 60,
    },
  ];

  var DEMO_KEY = 'invite_demo_rows_v1';

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
        contact: payload.contact || null,
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
