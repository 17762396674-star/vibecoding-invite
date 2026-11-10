# 拥抱 AI，拒绝焦虑 · 活动预告站

江西飞行学院编程爱好者协会技术分享的活动预告 + 问卷收集站。
零构建静态站，托管在 GitHub Pages；数据存在 Supabase，权限写在数据库里。

- 活动页：`index.html`
- 管理后台：`admin.html`（只有站长能进）

---

## 1. 一分钟看懂它怎么运转

```
访客 ──填写──► Supabase 数据库 ──► 管理后台 ──► CSV / JSON
                  ▲
            访客读不回来（anon 没有任何 SELECT 策略）
```

三件事分开做，互不越界：

| 角色 | 能做什么 | 不能做什么 |
| --- | --- | --- |
| 访客（未登录） | 提交问卷 | 看任何一条记录、导出、修改、删除 |
| 站长（登录） | 读全表、导出 CSV/JSON、订正、删除 | —— |
| 数据库 | 用 RLS 策略执行上面两行 | 被前端绕过 |

**关键点：导出按钮不是权限。** 就算有人把 `admin.js` 里的判断全删掉，
他去查表时数据库仍然只返回 `0 rows`，因为 `anon` 角色没有任何 SELECT 策略。
权限在数据库，不在按钮上。

---

## 2. 信息结构

页面按「先建立兴趣 → 再降低门槛 → 最后请他动手」排，不是按内容多少排。

| # | 区块 | 作用 | 对应 `index.html` |
| --- | --- | --- | --- |
| — | 顶部导航 | 三个锚点 + 一个常驻 CTA，移动端折叠 | `.nav` |
| 0 | Hero + 票根 | 一眼看完「是什么、什么时候、在哪、要带什么」 | `.hero` / `.ticket` |
| 01 | 讲什么 | 四件事按顺序，说明这是一条路不是四个知识点 | `#topics` |
| 02 | 会带走 | 三个可交付物，把「听讲座」变成「拿东西」 | `#gains` |
| 03 | 谁该来 / 带什么 | 降低门槛：不需要基础；带电脑更好，但不做要求 | `#prep` |
| 04 | 两张问卷 | 主转化点，深色区，视觉上「要做事了」 | `#survey` |
| — | 结尾 + 页脚 | 再给一次 CTA；页脚放管理入口 | `.end` / `.foot` |

问卷为什么合成一张表单：昵称只填一次，两题可以只答一题（至少四字），
数据库里就是一行记录，导出就是一张表。比两张独立表单少一半重复输入。

页面没有汇总墙，也没有公开读取入口：访客写完就结束，内容只有站长在后台看得到。

---

## 3. 数据与权限方案

### 3.1 表结构（`supabase/schema.sql`）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `created_at` | timestamptz | 提交时间 |
| `nickname` | text | 昵称，默认「匿名同学」 |
| `grade` | text | 年级专业，可空 |
| `expect` | text | 问卷 A：对活动的期待 |
| `ai_story` | text | 问卷 B：AI 故事 |

约束在数据库里也做了一遍：昵称 1–24 字、每题 ≤800 字、两题至少一题 ≥4 字。
前端校验只是体验，绕不过这张表。

### 3.2 两道关

1. **写**：表级权限只给 `anon` 一个 `insert`，策略 `anyone_can_submit` 允许写入。
   除此之外它什么都干不了。
2. **读**：`anon` 连 `select` 的表级权限都没有，也没有任何 SELECT 策略，
   直接查表只会报错或拿到 0 行；页面本身也不提供读取入口。
   要读全表，`owner_reads_all` 要求 `is_owner()` 为真，
   而它比对的是 JWT 里的邮箱。别人注册了账号也不是那个邮箱，读不到。

### 3.3 导出

`admin.html` 拉到数据后在浏览器本地生成文件，不经过任何第三方：

- **CSV**：带 UTF-8 BOM，Excel 双击直接打开不乱码；字段做了引号转义，换行也能正确保留。
- **JSON**：备份或二次处理用。

导出的是「当前筛选后的结果」，所以你可以只导某一天、或只导 AI 故事。

---

## 4. 五步接上数据库（约 10 分钟）

### 4.1 注册并建项目

1. 打开 <https://supabase.com>，用 GitHub 账号登录（免费）。
2. `New project`：名字随便，区域选 `Southeast Asia (Singapore)`（国内访问较快），
   数据库密码自己存好。
3. 等 1–2 分钟初始化完成。

### 4.2 跑建表脚本

1. 左侧 `SQL Editor` → `New query`。
2. 打开本项目 `supabase/schema.sql`，**先把第 2 节里的 `CHANGE_ME@example.com`
   改成你要登录用的邮箱**，然后整段粘贴进编辑器。
3. 点 `Run`。最后会输出一张自检表，六项都应该是 `OK`。

> 如果第一项显示「还没改」，说明邮箱没替换，改完重跑一次即可（脚本可重复执行）。

### 4.3 建管理员账号 + 关掉注册

1. 左侧 `Authentication` → `Users` → `Add user` → `Create new user`。
   填 4.2 里那个邮箱 + 一个密码，勾上 `Auto Confirm User`。
2. 同页 `Sign In / Providers` → `Email`，把 **`Allow new users to sign up` 关掉**。
   这一步很重要：关掉之后，全世界只有你手动建的这一个账号能登录。

### 4.4 填两个值

`Project Settings` → `API`，复制：

- `Project URL` → 填到 `assets/js/config.js` 的 `SUPABASE_URL`
- `anon` `public` key → 填到 `SUPABASE_ANON_KEY`

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  MAX_LEN: 800,
};
```

`anon key` 是公开的，写进前端没问题——它只说明「谁在访问」，不带权限。
**不要**把 `service_role` key 放进来，那个等于数据库管理员密码。

### 4.5 验证

刷新 `index.html`，顶部橙色「演示模式」提示条应该消失。
随便提交一条，去 `admin.html` 登录，能看到它，导出一份 CSV。
再开一个无痕窗口打开 `admin.html`，用别的邮箱登录 —— 应该读不到任何数据。

---

## 5. 部署到 GitHub Pages

```bash
cd vibecoding-invite
git init
git add .
git commit -m "feat: 活动预告站 + 双问卷收集 + 管理员导出"
git branch -M main
git remote add origin https://github.com/<你的用户名>/vibecoding-invite.git
git push -u origin main
```

然后在网页上开 Pages（或命令行）：

- 网页：仓库 `Settings` → `Pages` → Source 选 `Deploy from a branch` →
  Branch `main` / `(root)` → Save。
- 命令行：

```bash
gh api -X POST repos/<用户名>/vibecoding-invite/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

一两分钟后地址是：

```
https://<用户名>.github.io/vibecoding-invite/
```

这个仓库已经带了 `.nojekyll`，避免 Pages 的 Jekyll 处理把下划线开头的文件吃掉。

> 如果你在国内 push 卡住，用和本机一致的方式：
> `git -c http.sslVerify=false -c credential.helper='!gh auth git-credential' push -u origin main`

---

## 6. 日常使用

**导出**：`admin.html` → 登录 → 选筛选条件 → 导出表格（CSV）。
只导「写了 AI 故事的人」就把下拉框切到第三项。

**删除**：不可恢复，会二次确认。

**改文案**：全在 `index.html` 里，搜「✏️」能看到需要替换的活动信息
（时间、地点）。样式在 `assets/css/style.css` 顶部的 `:root` 里，
改颜色改那一块就够。

---

## 7. 需要注意的边界

- **没有防刷**：公开表单理论上会被脚本灌水。免费额度下影响不大，
  真遇到就在 Supabase 里加 rate limit，或者活动结束后直接关掉 Pages 上的页面。
- **不要在公开场合演示登录**：管理员密码只应你自己知道。
- **昵称也可能暴露身份**：有人会写「244软件彭弘炜」，导出的表只存在你电脑上，别转发到群里。
- **免费项目会休眠**：Supabase 免费版长期无请求会暂停，活动前一周打开一次控制台唤醒。
- **匿名不等于不可追溯**：表里没有存 IP，但 Supabase 侧仍有请求日志，别承诺「绝对匿名」。

---

## 8. 文件清单

```
index.html                  活动预告 + 双问卷
admin.html                  管理后台（登录 / 明细 / 导出）
assets/css/style.css        全站设计系统与组件
assets/css/admin.css        后台专用样式
assets/js/config.js         ← 只有这里需要你改
assets/js/store.js          数据层（Supabase / 本地演示两套实现）
assets/js/main.js           页面交互
assets/js/admin.js          后台逻辑与导出
assets/js/vendor/supabase.js  supabase-js 2.x（本地内置，不依赖 CDN）
assets/fonts/               自托管字体
assets/logo/jxfi-white.png  学校官方标识（白版，深色底用）
assets/logo/jxfi-ink.png    学校官方标识（墨色版，浅色底用）
assets/mark.svg             协会标志（纸飞机，图标源文件）
assets/favicon.svg          站点图标（协会标志）
supabase/schema.sql         建表 + RLS + 自检
.nojekyll                   GitHub Pages 直出静态文件
```

---

## 9. 标识与称谓

**称谓**：全站统一使用「江西飞行学院编程爱好者协会」。页头左侧是学校官方标志
（横版：校徽 + 中英文校名），一条竖线隔开后写「编程爱好者协会」，合起来就是全称；
页脚、票根、标题、后台署名一律写全称。

**学校官方标识**放在四处，都是「一眼能看见但不抢内容」的位置：

| 位置 | 用哪一版 | 高度 |
| --- | --- | --- |
| 页头品牌位（浅色底） | `assets/logo/jxfi-ink.png` | 26px（手机 21px） |
| 票根卡片左上（深色底） | `assets/logo/jxfi-white.png` | 30px |
| 页脚左侧（浅色底） | `assets/logo/jxfi-ink.png` | 30px |
| 后台登录页署名（浅色底） | `assets/logo/jxfi-ink.png` | 22px |

两版是同一张图，墨色版由白版按 alpha 通道换色生成，边缘不变形。换 logo 只需要
覆盖这两个文件，CSS 不用动：各处只固定高度，宽度按原图比例自适应。

**协会标志**（`assets/mark.svg`、`assets/favicon.svg`）：一张纸飞机，现在只用作
浏览器标签页图标，页头已经换成学校官方标志。
