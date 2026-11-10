/* ==========================================================================
   管理后台：登录 / 拉取全部明细 / 导出表格 / 隐藏 / 删除
   权限不在这里判断 —— 这里的每一次查询都由数据库 RLS 决定能不能成功，
   所以就算有人把这个页面的 JS 改一遍，也读不到别人的数据。
   ========================================================================== */

(function () {
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };

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
    fail('还没有配置数据库。先按 README 第 3 节填好 assets/js/config.js，再回来登录。');
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
  async function load() {
    rowsEl.innerHTML = '<tr><td colspan="7" style="padding:22px 12px;color:#7c766a">读取中…</td></tr>';
    var res = await client
      .from('responses')
      .select('id,created_at,nickname,grade,expect,ai_story,contact,publish')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (res.error) {
      rowsEl.innerHTML = '';
      tableEmpty.hidden = false;
      tableEmpty.textContent = '读不到数据：' + res.error.message;
      return;
    }
    allRows = res.data || [];
    renderStats();
    render();
  }

  function renderStats() {
    var t = allRows.length;
    var e = allRows.filter(function (r) {
      return !!r.expect;
    }).length;
    var a = allRows.filter(function (r) {
      return !!r.ai_story;
    }).length;
    var today = new Date().toDateString();
    var d = allRows.filter(function (r) {
      return new Date(r.created_at).toDateString() === today;
    }).length;

    $('#stTotal').textContent = t;
    $('#stExpect').textContent = e;
    $('#stAi').textContent = a;
    $('#stToday').textContent = d;
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
      if (kind === 'expect' && !r.expect) return false;
      if (kind === 'ai' && !r.ai_story) return false;
      if (kind === 'contact' && !r.contact) return false;
      if (!q) return true;
      var hay = [r.nickname, r.grade, r.expect, r.ai_story, r.contact]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function render() {
    var rows = currentRows();
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
          '" class="' +
          (r.publish ? '' : 'is-hidden-row') +
          '">' +
          '<td class="cell-nowrap">' +
          fmt(r.created_at) +
          '</td>' +
          '<td class="cell-name">' +
          esc(r.nickname) +
          '</td>' +
          '<td class="cell-text" style="max-width:96px">' +
          esc(r.grade || '—') +
          '</td>' +
          '<td class="cell-text">' +
          (r.expect ? '<span class="tag-mini">期待</span><br>' + esc(r.expect) : '—') +
          '</td>' +
          '<td class="cell-text">' +
          (r.ai_story ? '<span class="tag-mini">AI</span><br>' + esc(r.ai_story) : '—') +
          '</td>' +
          '<td class="cell-text" style="max-width:120px">' +
          esc(r.contact || '—') +
          '</td>' +
          '<td class="cell-ops">' +
          '<button class="op" data-act="toggle" data-id="' +
          r.id +
          '">' +
          (r.publish ? '隐藏' : '显示') +
          '</button>' +
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

    if (act === 'toggle') {
      btn.disabled = true;
      var res = await client
        .from('responses')
        .update({ publish: !row.publish })
        .eq('id', id);
      btn.disabled = false;
      if (res.error) return toast('操作失败：' + res.error.message);
      row.publish = !row.publish;
      render();
      toast(row.publish ? '已恢复显示' : '已从墙上隐藏');
    }

    if (act === 'del') {
      if (!window.confirm('删除这条记录？不可恢复。\n\n' + (row.nickname || '') + '：' + (row.expect || row.ai_story || '').slice(0, 40) + '…')) return;
      btn.disabled = true;
      var r2 = await client.from('responses').delete().eq('id', id);
      btn.disabled = false;
      if (r2.error) return toast('删除失败：' + r2.error.message);
      allRows = allRows.filter(function (r) {
        return r.id !== id;
      });
      renderStats();
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

    var head = ['序号', '提交时间', '昵称', '年级专业', '对活动的期待', 'AI 故事', '联系方式', '是否公开展示'];
    var lines = [head.map(csvCell).join(',')];

    rows.forEach(function (r, i) {
      lines.push(
        [
          i + 1,
          fmt(r.created_at),
          r.nickname,
          r.grade,
          r.expect,
          r.ai_story,
          r.contact,
          r.publish ? '是' : '否',
        ]
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
