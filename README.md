# 日语词汇闯关 · JP Vocab Quest

> 🎮 在线试玩：**https://firstplaye.github.io/jp-vocab-quest/**
> 手机上打开即可玩，可以「添加到主屏幕」当作 App 用。

把《软件工程师日语词汇表》变成的**闯关式背单词游戏**。按课分成关卡，看到中文释义写出对应的日语：
**汉字词输入平假名，外来语输入片假名**。纯前端单页应用，打开网页就能玩，手机上也能用。

## 玩法

| 模式 | 说明 |
| --- | --- |
| ✍️ 写假名 | 看中文 → 输入假名（主玩法）。汉字词写平假名，外来语写片假名 |
| 🀄 选择题 | 看中文 → 从 4 个日语词中选一个 |
| 🎲 随机挑战 | 从全部词库里抽 20 个词混合出题 |
| 📕 错题本 | 自动收集答错的词，可以"只练这些错题" |

- 答错了会显示正确答案，并且该词会排到队尾**再考你一次**
- 假名种类写错（比如该写片假名却写了平假名）会单独提示，不直接判错
- 💡 提示按钮会给出答案的首个假名
- 每课答对 80% 以上即算通关 🏅，进度、成绩、错题都存在浏览器本地

## 词库

- 共 **23 课 / 471 个词条**，覆盖第 1–19 课以及第 28–31 课
- 每课一个关卡，词条包含：日语词形、假名读音、中文释义

词库由 `scripts/parse-vocab.mjs` 从 `scripts/source/vocab-raw.txt`（Word 词汇表导出的纯文本）解析生成，
产物是 `src/data/lessons.json`。原文档中因换行折断、缺失读音的少量词条在脚本中的
`PATCH_WORDS` / `ADD_WORDS` / `DROP_WORDS` 里做了人工校对。

重新生成词库：

```bash
npm run parse
```

## 本地开发

```bash
npm install     # 安装依赖
npm run dev     # 开发模式, 默认 http://localhost:5173
npm run build   # 打包到 dist/
npm run preview # 本地预览打包结果
```

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy.yml`，推送到 `main` 分支后会自动构建并发布。

第一次使用需要在仓库里打开一次开关：

> **Settings → Pages → Build and deployment → Source 选择 `GitHub Actions`**

之后每次 `git push` 都会自动更新线上版本，访问地址形如：

```
https://<你的用户名>.github.io/jp-vocab-quest/
```

在手机上打开这个地址（可以"添加到主屏幕"），用日语输入法直接作答即可。

## 目录结构

```
src/
  App.vue                    页面切换与关卡调度
  components/
    HomeView.vue             首页: 统计 / 模式切换 / 关卡选择
    QuizView.vue             答题页: 输入模式 + 选择题模式
    ResultView.vue           单关结算
    WrongBookView.vue        错题本
  composables/useProgress.js 进度、掌握度、错题本(localStorage)
  utils/kana.js              平/片假名转换、答案判定、提示
  data/lessons.json          词库
scripts/
  parse-vocab.mjs            词库解析脚本
  source/vocab-raw.txt       词汇表原始文本
```

## 判定规则

- 忽略空格、全角半角、常见标点差异
- **区分**平假名与片假名：`はんえい` ✅ ／ `ハンエイ` ❌（会提示该用哪种）
- 带长音符的词（如 `コピー`）需要写出长音符

## License

仅用于个人学习，词汇表版权归原文档作者所有。
