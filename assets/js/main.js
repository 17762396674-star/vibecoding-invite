/* ==========================================================================
   页面交互：导航 / 进场 / 字数 / 草稿 / 提交
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
  var sections = ['topics', 'gains', 'prep']
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

  if (form) {
    var fields = ['nickname', 'grade', 'expect', 'ai_story'];
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

      if (!expect && !aiStory) {
        setAlert(errEl, '两题至少写一题，随便写两句也行。');
        (expect === '' ? $('#expect') : $('#ai_story')).focus();
        return;
      }
      if ((expect && expect.length < 4) || (aiStory && aiStory.length < 4)) {
        setAlert(errEl, '再多写几个字吧，太短了看不清你到底想说什么。');
        return;
      }

      btn.disabled = true;
      var old = btn.textContent;
      btn.textContent = '正在提交…';

      try {
        await window.Store.submit({
          nickname: nickname,
          grade: grade,
          expect: expect,
          ai_story: aiStory,
        });

        setAlert(
          okEl,
          window.Store.isDemo
            ? '记下了。不过现在是演示模式，只存在这台设备上，别人看不到。'
            : '提交成功，我收到了。开讲前会看一遍。'
        );

        // 清空两题，保留称呼，方便再写一条
        form.elements['expect'].value = '';
        form.elements['ai_story'].value = '';
        $$('.counter').forEach(function (c) {
          var f = document.getElementById(c.getAttribute('data-counter-for'));
          if (f) f.dispatchEvent(new Event('input'));
        });
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch (e2) {}
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
})();
