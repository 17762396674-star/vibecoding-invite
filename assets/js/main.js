/* ==========================================================================
   页面交互：导航 / 进场 / 字数 / 草稿 / 提交 / 汇总墙
   ========================================================================== */

(function () {
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  /* ---------------- 演示模式提示 ---------------- */
  if (window.Store && window.Store.isDemo) {
    var bar = $('#demoBar');
    if (bar) bar.hidden = false;
  }

  /* ---------------- 导航 ---------------- */
  var nav = $('#nav');
  var burger = $('#burger');

  var onScroll = function () {
    if (window.scrollY > 8) nav.classList.add('is-stuck');
    else nav.classList.remove('is-stuck');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });
    $$('.nav__link, .nav__cta', nav).forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------------- 滚动进场 ---------------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.06 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add('in');
    });
  }

  /* ---------------- 滚动高亮 ---------------- */
  var sections = ['topics', 'gains', 'agenda', 'prep', 'wall']
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);

  if (sections.length) {
    var spy = function () {
      var y = window.scrollY + 140;
      var current = null;
      sections.forEach(function (s) {
        if (s.offsetTop <= y) current = s.id;
      });
      $$('.nav__link').forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + current);
      });
    };
    spy();
    window.addEventListener('scroll', spy, { passive: true });
  }

  /* ---------------- Toast ---------------- */
  var toastEl = $('#toast');
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-on');
    }, 3200);
  }

  /* ---------------- 表单 ---------------- */
  var form = $('#form');
  var btn = $('#submitBtn');
  var errEl = $('#formErr');
  var okEl = $('#formOk');
  var DRAFT_KEY = 'invite_draft_v1';
  var MAX_LEN = (window.APP_CONFIG && window.APP_CONFIG.MAX_LEN) || 800;

  function setAlert(el, msg) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!msg);
  }

  /* 字数统计 */
  $$('.counter').forEach(function (c) {
    var field = document.getElementById(c.getAttribute('data-counter-for'));
    if (!field) return;
    var update = function () {
      var n = field.value.length;
      c.textContent = n + ' / ' + MAX_LEN;
      c.classList.toggle('is-warn', n > MAX_LEN * 0.9);
    };
    field.addEventListener('input', update);
    update();
  });

  /* 草稿：避免刷新丢内容 */
  if (form) {
    var fields = ['nickname', 'grade', 'expect', 'ai_story', 'contact'];
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        var draft = JSON.parse(raw);
        fields.forEach(function (k) {
          var el = form.elements[k];
          if (el && draft[k]) el.value = draft[k];
        });
        $$('.counter').forEach(function (c) {
          var f = document.getElementById(c.getAttribute('data-counter-for'));
          if (f) f.dispatchEvent(new Event('input'));
        });
      }
    } catch (e) {}

    var saveDraft = function () {
      var data = {};
      fields.forEach(function (k) {
        var el = form.elements[k];
        if (el && el.value) data[k] = el.value;
      });
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      } catch (e) {}
    };
    var draftTimer = null;
    form.addEventListener('input', function () {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 400);
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      setAlert(errEl, '');
      setAlert(okEl, '');

      var hp = form.elements['website'];
      if (hp && hp.value) return; // 机器人

      var nickname = (form.elements['nickname'].value || '').trim();
      var grade = (form.elements['grade'].value || '').trim();
      var expect = (form.elements['expect'].value || '').trim();
      var aiStory = (form.elements['ai_story'].value || '').trim();
      var contact = (form.elements['contact'].value || '').trim();

      if (!expect && !aiStory) {
        setAlert(errEl, '两题至少写一题，随便写两句也行。');
        (expect === '' ? $('#expect') : $('#ai_story')).focus();
        return;
      }
      if ((expect && expect.length < 4) || (aiStory && aiStory.length < 4)) {
        setAlert(errEl, '再多写几个字吧，太短的条目上墙不好看。');
        return;
      }

      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = '正在提交…';

      try {
        var res = await window.Store.submit({
          nickname: nickname,
          grade: grade,
          expect: expect,
          ai_story: aiStory,
          contact: contact,
        });

        setAlert(
          okEl,
          res.position
            ? '提交成功，你是第 ' + res.position + ' 位。已经上墙了，往下翻。'
            : '提交成功，已经上墙了，往下翻。'
        );

        // 清空（保留昵称，方便再写一条）
        form.elements['expect'].value = '';
        form.elements['ai_story'].value = '';
        form.elements['contact'].value = '';
        $$('.counter').forEach(function (c) {
          var f = document.getElementById(c.getAttribute('data-counter-for'));
          if (f) f.dispatchEvent(new Event('input'));
        });
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch (e2) {}

        await wall.reload();
        var wallEl = document.getElementById('wall');
        if (wallEl) {
          window.setTimeout(function () {
            wallEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 260);
        }
      } catch (err) {
        setAlert(
          errEl,
          '没提交成功：' +
            (err && err.message ? err.message : '网络或数据库异常') +
            '。可以截图发到协会群里。'
        );
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  }

  /* ---------------- 汇总墙 ---------------- */
  var listEl = $('#wallList');
  var emptyEl = $('#wallEmpty');
  var moreWrap = $('#wallMore');
  var moreBtn = $('#moreBtn');
  var countEl = $('#wallCount');

  var COLORS = ['#1a34d8', '#0d7a4a', '#b4451a', '#6b3fa0', '#0f6d8c', '#8a5a00'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initial(name) {
    var n = (name || '匿').trim();
    return n.slice(0, 1);
  }

  function colorOf(name) {
    var h = 0;
    var s = name || '匿';
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    return COLORS[h % COLORS.length];
  }

  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    if (!t) return '';
    var diff = Date.now() - t;
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = new Date(t);
    return d.getMonth() + 1 + '-' + String(d.getDate()).padStart(2, '0');
  }

  function cardHTML(item, kind) {
    var showExpect = !!item.expect && kind !== 'ai';
    var showAi = !!item.ai_story && kind !== 'expect';
    var blocks = '';
    if (showExpect) {
      blocks +=
        '<div class="note-card__kind">期待</div><p class="note-card__text">' +
        esc(item.expect) +
        '</p>';
    }
    if (showAi) {
      blocks +=
        '<div class="note-card__kind"' +
        (showExpect ? ' style="margin-top:14px"' : '') +
        '>AI 故事</div><p class="note-card__text">' +
        esc(item.ai_story) +
        '</p>';
    }
    return (
      '<article class="note-card">' +
      '<div class="note-card__top">' +
      '<span class="avatar" style="background:' +
      colorOf(item.nickname) +
      '">' +
      esc(initial(item.nickname)) +
      '</span>' +
      '<span class="who">' +
      '<span class="name">' +
      esc(item.nickname || '匿名同学') +
      '</span>' +
      (item.grade ? '<span class="grade">' + esc(item.grade) + '</span>' : '') +
      '</span>' +
      '<span class="note-card__meta">' +
      timeAgo(item.created_at) +
      '</span>' +
      '</div>' +
      blocks +
      '</article>'
    );
  }

  var wall = {
    kind: 'all',
    offset: 0,
    items: [],
    loading: false,

    async reload() {
      this.kind = currentKind();
      this.offset = 0;
      this.items = [];
      if (listEl) listEl.innerHTML = '';
      await this.load(true);
      this.updateCount();
    },

    async load(reset) {
      if (this.loading) return;
      this.loading = true;
      if (moreBtn) {
        moreBtn.disabled = true;
        moreBtn.textContent = '加载中…';
      }
      try {
        var res = await window.Store.list({
          kind: this.kind,
          offset: this.offset,
        });
        var html = res.items
          .map(function (it) {
            return cardHTML(it, wall.kind);
          })
          .join('');
        if (reset && listEl) listEl.innerHTML = html;
        else if (listEl) listEl.insertAdjacentHTML('beforeend', html);
        this.items = this.items.concat(res.items);
        this.offset += res.items.length;
        if (moreWrap) moreWrap.hidden = !res.hasMore;
        if (emptyEl) emptyEl.hidden = this.items.length > 0;
      } catch (err) {
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.innerHTML =
            '<b>暂时读不到数据</b>' +
            esc(err && err.message ? err.message : '网络异常') +
            '，稍后刷新试试。';
        }
      } finally {
        this.loading = false;
        if (moreBtn) {
          moreBtn.disabled = false;
          moreBtn.textContent = '再看一些';
        }
      }
    },

    async updateCount() {
      if (!countEl) return;
      try {
        var n = await window.Store.count();
        countEl.textContent = n == null ? '' : '已收到 ' + n + ' 条';
      } catch (e) {}
    },
  };

  function currentKind() {
    var t = $('.tab[aria-selected="true"]');
    return (t && t.getAttribute('data-filter')) || 'all';
  }

  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', async function () {
      $$('.tab').forEach(function (t) {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      wall.kind = tab.getAttribute('data-filter');
      wall.offset = 0;
      wall.items = [];
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = true;
      await wall.load(true);
    });
  });

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      wall.load(false);
    });
  }

  if (listEl) {
    wall.reload();
    window.__wall = wall;
  }
})();
