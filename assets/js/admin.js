/* ==========================================================================
   管理后台：登录 / 拉取全部明细 / 导出表格 / 删除
   权限不在这里判断 —— 这里的每一次查询都由数据库 RLS 决定能不能成功，
   所以就算有人把这个页面的 JS 改一遍，也读不到别人的数据。
   ========================================================================== */

(function () {
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };

  /* 六道问题：key 与数据库列一一对应 */
  var QUESTIONS = [
    { key: 'want', tag: 'A', title: '你对这场活动最想了解什么？', short: '最想了解什么' },
    { key: 'ai_story', tag: 'B', title: '你平时用 AI 做过什么有意思的事？', short: '用 AI 做过什么' },
    { key: 'worry', tag: 'C', title: '你是否担心 AI 的发展会冲击编程相关岗位？你最大的顾虑是什么？', short: '担心 AI 冲击岗位' },
    { key: 'site_idea', tag: 'D', title: '如果用 AI 快速搭建一个网站，你最想做什么类型的站点？', short: '想做哪类站' },
    { key: 'tool_gap', tag: 'E', title: '目前你最常用哪款 AI 工具？使用中遇到过哪些明显的短板？', short: '工具与短板' },
    { key: 'salon_wish', tag: 'F', title: '之后你还想在社团开展哪些类型的 AI 分享沙龙？', short: '想听哪些沙龙' },
  ];

  var cfg = window.APP_CONFIG || {};
  var configured = !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY && !!window.supabase;

  var loginView = $('#loginView');
  var panelView = $('#panelView');
  var loginForm = $('#loginForm');
  var loginMsg = $('#loginMsg');
  var loginBtn = $('#loginBtn');
  var logoutBtn = $('#logoutBtn');
  var whoami = $('#whoami');
  var rowsEl = $('#rows');
  var tableEmpty = $('#tableEmpty');
  var toastEl = $('#toast');

  var allRows = [];
  var session = null;
  var client = null;

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    setTimeout(function () {
      toastEl.classList.remove('is-on');
    }, 2600);
  }

  function fail(msg) {
    loginMsg.textContent = msg;
  }

  if (!configured) {
    loginBtn.disabled = true;
    fail('还没有配置数据库。按 README 第 4 节把 Supabase 的 URL 和 anon key 填进 assets/js/config.js，再回来登录。');
    return;
  }

  client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  /* ---------------- 登录态 ---------------- */
  client.auth.getSession().then(function (res) {
    var s = res && res.data ? res.data.session : null;
    if (s) enter(s);
    else leave();
  });

  client.auth.onAuthStateChange(function (_evt, s) {
    if (s) enter(s);
    else leave();
  });

  function enter(s) {
    session = s;
    loginView.hidden = true;
    panelView.hidden = false;
    logoutBtn.hidden = false;
    whoami.hidden = false;
    whoami.textContent = s.user && s.user.email ? s.user.email : '管理员';
    load();
  }

  function leave() {
    session = null;
    loginView.hidden = false;
    panelView.hidden = true;
    logoutBtn.hidden = true;
    whoami.hidden = true;
    allRows = [];
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginMsg.textContent = '';
    loginBtn.disabled = true;
    var old = loginBtn.textContent;
    loginBtn.textContent = '登录中…';

    var email = $('#email').value.trim();
    var password = $('#password').value;

    try {
      var res = await client.auth.signInWithPassword({
        email: email,
        password: password,
      });
      if (res.error) throw new Error(translate(res.error.message));
      $('#password').value = '';
    } catch (err) {
      fail(err && err.message ? err.message : '登录失败');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = old;
    }
  });

  function translate(m) {
    if (!m) return '登录失败';
    if (/Invalid login credentials/i.test(m)) return '邮箱或密码不对。';
    if (/Email not confirmed/i.test(m))
      return '这个账号还没验证邮箱。去 Supabase 的 Authentication → Users 里把邮箱标记为已验证。';
    if (/rate limit|too many/i.test(m)) return '试太多次了，等一分钟再试。';
    return m;
  }

  logoutBtn.addEventListener('click', function () {
    client.auth.signOut();
  });

  /* ---------------- 拉数据 ---------------- */
  var COLS = ['id', 'created_at', 'full_name', 'grade'].concat(
    QUESTIONS.map(function (q) {
      return q.key;
    })
  );

  async function load() {
    rowsEl.innerHTML = '<tr><td colspan="5" style="padding:22px 12px;color:#7c766a">读取中…</td></tr>';
    var res = await client
      .from('responses')
      .select(COLS.join(','))
      .order('created_at', { ascending: false })
      .limit(2000);

    if (res.error) {
      rowsEl.innerHTML = '';
      tableEmpty.hidden = false;
      tableEmpty.textContent = '读不到数据：' + res.error.message;
      return;
    }
    allRows = res.data || [];
    renderStats();
    renderKindOptions();
    render();
  }

  /* 每题填了多少人，直接写在筛选框的选项上 */
  function countBy(key) {
    return allRows.filter(function (r) {
      return !!(r[key] && String(r[key]).trim());
    }).length;
  }

  function renderKindOptions() {
    var sel = $('#kind');
    Array.prototype.forEach.call(sel.options, function (opt) {
      if (opt.value === 'all') {
        opt.textContent = '全部回答（' + allRows.length + ' 份）';
        return;
      }
      var q = QUESTIONS.filter(function (x) {
        return x.key === opt.value;
      })[0];
      if (q) opt.textContent = '只看 ' + q.tag + ' · ' + q.short + '（' + countBy(q.key) + '）';
    });
  }

  function answeredCount(r) {
    return QUESTIONS.filter(function (q) {
      return !!(r[q.key] && String(r[q.key]).trim());
    }).length;
  }

  function renderStats() {
    var today = new Date().toDateString();
    $('#stTotal').textContent = allRows.length;
    $('#stToday').textContent = allRows.filter(function (r) {
      return new Date(r.created_at).toDateString() === today;
    }).length;
    $('#stFull').textContent = allRows.filter(function (r) {
      return answeredCount(r) === QUESTIONS.length;
    }).length;

    var sum = allRows.reduce(function (a, r) {
      return a + answeredCount(r);
    }, 0);
    $('#stAvg').textContent = allRows.length ? (sum / allRows.length).toFixed(1) : '—';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() +
      '-' +
      p(d.getMonth() + 1) +
      '-' +
      p(d.getDate()) +
      ' ' +
      p(d.getHours()) +
      ':' +
      p(d.getMinutes())
    );
  }

  function currentRows() {
    var q = $('#q').value.trim().toLowerCase();
    var kind = $('#kind').value;

    return allRows.filter(function (r) {
      if (kind !== 'all' && !(r[kind] && String(r[kind]).trim())) return false;
      if (!q) return true;
      var hay = [r.full_name, r.grade]
        .concat(
          QUESTIONS.map(function (x) {
            return r[x.key];
          })
        )
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function answerHtml(r, onlyKey) {
    var qs = onlyKey
      ? QUESTIONS.filter(function (q) {
          return q.key === onlyKey;
        })
      : QUESTIONS;

    var parts = qs
      .filter(function (q) {
        return r[q.key] && String(r[q.key]).trim();
      })
      .map(function (q) {
        return (
          '<div class="ans">' +
          '<span class="ans__k" title="' +
          esc(q.title) +
          '">' +
          q.tag +
          '</span>' +
          '<span class="ans__t">' +
          esc(r[q.key]) +
          '</span>' +
          '</div>'
        );
      });

    return parts.length ? parts.join('') : '—';
  }

  function render() {
    var rows = currentRows();
    var kind = $('#kind').value;

    if (!rows.length) {
      rowsEl.innerHTML = '';
      tableEmpty.hidden = false;
      tableEmpty.textContent = allRows.length ? '没有符合条件的记录。' : '还没有人提交。';
      return;
    }
    tableEmpty.hidden = true;
    rowsEl.innerHTML = rows
      .map(function (r) {
        return (
          '<tr data-id="' +
          r.id +
          '">' +
          '<td class="cell-nowrap" data-label="时间">' +
          fmt(r.created_at) +
          '</td>' +
          '<td class="cell-name" data-label="姓名">' +
          esc(r.full_name || '—') +
          '</td>' +
          '<td class="cell-text" style="max-width:120px" data-label="年级专业">' +
          esc(r.grade || '—') +
          '</td>' +
          '<td class="cell-text" data-label="回答">' +
          answerHtml(r, kind === 'all' ? null : kind) +
          '</td>' +
          '<td class="cell-ops" data-label="操作">' +
          '<button class="op op--danger" data-act="del" data-id="' +
          r.id +
          '">删除</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  $('#q').addEventListener('input', render);
  $('#kind').addEventListener('change', render);
  $('#reloadBtn').addEventListener('click', load);

  rowsEl.addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    var row = allRows.find(function (r) {
      return r.id === id;
    });
    if (!row) return;

    if (act === 'del') {
      var preview = QUESTIONS.map(function (q) {
        return row[q.key];
      })
        .filter(Boolean)
        .join(' ')
        .slice(0, 40);
      if (
        !window.confirm(
          '删除这条记录？不可恢复。\n\n' + (row.full_name || '') + '：' + preview + '…'
        )
      )
        return;
      btn.disabled = true;
      var r2 = await client.from('responses').delete().eq('id', id);
      btn.disabled = false;
      if (r2.error) return toast('删除失败：' + r2.error.message);
      allRows = allRows.filter(function (r) {
        return r.id !== id;
      });
      renderStats();
      renderKindOptions();
      render();
      toast('已删除');
    }
  });

  /* ---------------- 导出 ---------------- */

  function csvCell(v) {
    if (v == null) return '';
    var s = String(v).replace(/\r\n/g, '\n');
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function stamp() {
    var d = new Date();
    var p = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      '_' +
      p(d.getHours()) +
      p(d.getMinutes())
    );
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  $('#exportCsv').addEventListener('click', function () {
    var rows = currentRows();
    if (!rows.length) return toast('没有可导出的内容');

    var head = ['序号', '提交时间', '姓名', '年级专业'].concat(
      QUESTIONS.map(function (q) {
        return q.tag + ' ' + q.title;
      })
    );
    var lines = [head.map(csvCell).join(',')];

    rows.forEach(function (r, i) {
      lines.push(
        [i + 1, fmt(r.created_at), r.full_name, r.grade]
          .concat(
            QUESTIONS.map(function (q) {
              return r[q.key];
            })
          )
          .map(csvCell)
          .join(',')
      );
    });

    // BOM：让 Excel 认出 UTF-8，避免中文乱码
    download('活动问卷_' + stamp() + '.csv', '\ufeff' + lines.join('\r\n'), 'text/csv');
    toast('已导出 ' + rows.length + ' 条');
  });

  $('#exportJson').addEventListener('click', function () {
    var rows = currentRows();
    if (!rows.length) return toast('没有可导出的内容');
    download(
      '活动问卷_' + stamp() + '.json',
      JSON.stringify(rows, null, 2),
      'application/json'
    );
    toast('已导出 ' + rows.length + ' 条');
  });
})();
