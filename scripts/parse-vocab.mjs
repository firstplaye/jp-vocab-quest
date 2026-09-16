/**
 * 把「软件工程师日语词汇表」导出的纯文本解析成结构化数据。
 *
 * 输入: scripts/source/vocab-raw.txt   (由 Word 另存/导出而来, UTF-8)
 * 输出: src/data/lessons.json          ({ lessons: [...], stats: {...} })
 *
 * 词条在原文档中的形态:
 *   発注（はっちゅう）/订货
 *   いつも/总是
 *   プロジェクト（project）/项目
 *   ～済（ずみ）/结束，完成
 *   项目：プロジェクト              (第31课, 冒号式)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, 'source', 'vocab-raw.txt')
const OUT = path.join(__dirname, '..', 'src', 'data', 'lessons.json')

const HIRA = /[\u3041-\u309F]/
const KATA = /[\u30A0-\u30FF]/
const KANA = /[\u3041-\u309F\u30A0-\u30FF\u30FC]/
const KANJI = /[\u4E00-\u9FFF]/
const JP_CHARS = /[\u3041-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u30FCー]/
const CN_PUNCT = /[、，。；：？！「」【】]/

const clean = (s) =>
  s
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const raw = fs.readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '')
// Word 导出的段落标记是裸 \r
const lines = raw.split(/\r\n|\r|\n/)

/** 1. 按「第N课」切分 (课次可能是中文数字: 第十九课 / 第28课) */
const CN_DIGIT = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
function cn2num(s) {
  if (/^\d+$/.test(s)) return Number(s)
  const i = s.indexOf('十')
  if (i === -1) return [...s].reduce((n, c) => n * 10 + (CN_DIGIT[c] ?? 0), 0)
  const tens = i === 0 ? 1 : (CN_DIGIT[s[0]] ?? 1)
  const ones = s.slice(i + 1)
  return tens * 10 + (ones ? cn2num(ones) : 0)
}

const lessons = []
const lessonMap = new Map()
let cur = null
for (const line of lines) {
  if (!line.trim()) continue
  const t = line.match(/^\s*第\s*([〇零一二三四五六七八九十\d]+)\s*课\s*(.*)$/)
  if (t) {
    const id = cn2num(t[1])
    // 原文档里第31课出现了两次, 这里合并
    if (lessonMap.has(id)) {
      cur = lessonMap.get(id)
    } else {
      cur = { id, title: clean(t[2]), lines: [] }
      lessonMap.set(id, cur)
      lessons.push(cur)
    }
    continue
  }
  if (cur) cur.lines.push(line)
}
lessons.sort((a, b) => a.id - b.id)

/** 2. 单元格切分: 制表符 或 连续 2 个以上空白(含全角空格)视为列分隔 */
function splitCells(line) {
  return line
    .split(/\t+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 3. 括号里的英文注释 → 片假名 (てんぷfile → てんぷファイル) */
const EN2KATA = {
  file: 'ファイル',
  tab: 'タブ',
  data: 'データ',
  check: 'チェック',
  test: 'テスト',
  work: 'ワーク',
  sheet: 'シート',
  sub: 'サブ',
  back: 'バック',
  menu: 'メニュー',
}

/**
 * 从「日语串」里分离出 词形 与 读音
 *   発注（はっちゅう） → { jp:'発注', kana:'はっちゅう' }
 *   定義（ていぎ）ファイル（definition file） → { jp:'定義ファイル', kana:'ていぎ' }
 *   クライアント(client) → { jp:'クライアント', kana:'' }
 */
function extractJpKana(part) {
  let kana = ''
  const re = /[（(]([^（()）]*)[）)]/g
  let m
  while ((m = re.exec(part))) {
    const inner = clean(m[1])
    if (!inner || !KANA.test(inner)) continue
    const t = inner
      .replace(/[A-Za-z][A-Za-z0-9_.\-]*/g, (en) => EN2KATA[en.toLowerCase()] ?? '')
      .replace(/\s+/g, '')
      .trim()
    if (t) kana = t
  }
  const jp = part.replace(/[（(][^（()）]*[）)]/g, '').replace(/\s+/g, '').trim() || part.trim()
  return { jp, kana }
}

/** 依据 词形/读音 判定题目类型 */
function resolveType(jp, kana) {
  if (kana && kana !== jp) return { kana, type: KANJI.test(jp) ? 'kanji' : 'katakana' }
  if (KATA.test(jp) && !HIRA.test(jp)) return { kana: jp, type: 'katakana' }
  if (KANA.test(jp)) return { kana: jp, type: 'kana' }
  return { kana: jp, type: 'raw' } // 没有读音信息, 需要人工补
}

/**
 * 4. 解析一条词条
 * @returns {{jp:string,kana:string,cn:string,type:string,alts?:string[]}|null}
 */
function parseEntry(cell) {
  const slash = cell.search(/[/／]/)
  let jpPart
  let cn
  if (slash >= 0) {
    jpPart = cell.slice(0, slash).trim()
    cn = clean(cell.slice(slash + 1).replace(/[/／]/g, '、'))
  } else {
    // 没有斜杠的写法: 「管理（かんり）管理」「お世話になる（おせわになる）」
    const m = cell.match(/^(.*?[（(][^（()）]*[）)])\s*(.*)$/)
    if (m) {
      jpPart = m[1].trim()
      cn = clean(m[2])
    } else {
      // 「既存　きぞん」这类只有汉字+读音的补充词
      const m2 = cell.match(/^([\u4E00-\u9FFF]+)\s+([\u3041-\u309F\u30A0-\u30FF]+)$/)
      if (!m2) return null
      return { jp: m2[1], kana: m2[2], cn: '', type: 'kanji' }
    }
  }
  if (!jpPart) return null
  // 日语侧必须以日语字符(或 ～ / 波浪号 / 拉丁字母)开头, 否则说明切分错了
  const first = jpPart[0]
  if (!JP_CHARS.test(first) && !/[A-Za-z]/.test(first) && !/[～~]/.test(first)) return null

  let { jp, kana } = extractJpKana(jpPart)
  // 读音里用于表示前后缀的波浪号去掉, 词形保留
  kana = kana.replace(/[～~]/g, '').trim()
  jp = jp.trim()
  if (!jp) return null

  const resolved = resolveType(jp, kana)
  return { jp, kana: resolved.kana, cn, type: resolved.type }
}

/** 5. 第31课的「中文：日语」格式 */
function parseColon(cell) {
  const m = cell.match(/^(.+?)[：:]\s*(.+)$/)
  if (!m) return null
  const cn = clean(m[1])
  const jpRaw = clean(m[2]).replace(/[：:]\s*$/, '')
  if (!JP_CHARS.test(jpRaw) && !/[A-Za-z]/.test(jpRaw)) return null
  const alts = jpRaw
    .split(/\s*(?:，|,|　or　|\sor\s)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const { jp, kana } = extractJpKana(alts[0])
  const resolved = resolveType(jp, kana)
  const out = { jp, kana: resolved.kana, cn, type: resolved.type }
  if (alts.length > 1) out.alts = alts.slice(1)
  return out
}

const report = []
const result = []

for (const lesson of lessons) {
  const words = []
  const seen = new Set()
  const lastByCol = [] // 同一列的上一个词条, 用于接续被折断的中文释义
  for (const line of lesson.lines) {
    const cells = splitCells(line)
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci]
      // 中文释义被折到下一行(「/给您添麻烦了…」或纯中文片段), 第31课的「中文：日语」不算
      const isCnTail =
        /^[/／]/.test(cell) ||
        (!KANA.test(cell) && !/[/／：:]/.test(cell) && KANJI.test(cell))
      if (isCnTail) {
        const last = lastByCol[ci]
        if (last) {
          last.cn = [last.cn, clean(cell.replace(/^[/／]/, ''))].filter(Boolean).join('；')
          continue
        }
      }
      const e = lesson.id === 31 ? parseColon(cell) || parseEntry(cell) : parseEntry(cell)
      if (!e) {
        report.push(`[L${lesson.id}] 未解析: ${cell}`)
        continue
      }
      const key = `${e.jp}|${e.cn}`
      if (seen.has(key)) continue
      seen.add(key)
      words.push(e)
      lastByCol[ci] = e
    }
  }
  result.push({ id: lesson.id, title: lesson.title, words })
}

/** 6. 人工校对: 原文档折行断裂 / 缺读音 / 缺释义 的补丁 */
const DROP_WORDS = [
  { lesson: 4, jp: /^through\)/ }, // "WT(wark  through)/走查" 被折断的碎片
  { lesson: 4, jp: /^せつめいしょ）/ }, // "取り扱い説明書（…" 被折断的碎片
  { lesson: 9, jp: /^file）/ }, // "オブジェクトファイル（object file）" 被折断的碎片
  { lesson: 31, jp: /^引数、パラメータ$/ }, // 拆成两个词
]

const PATCH_WORDS = [
  { lesson: 4, jp: 'マニュアル', set: { cn: '参考手册、说明书' } },
  { lesson: 6, jp: '添付', set: { kana: 'てんぷ', type: 'kanji' } },
  { lesson: 7, jp: 'テンポラリファイル', set: { cn: '临时文件' } },
  { lesson: 31, jp: '関数', set: { kana: 'かんすう', type: 'kanji' } },
  { lesson: 31, jp: '定数', set: { kana: 'ていすう', type: 'kanji' } },
  { lesson: 31, jp: '変数', set: { kana: 'へんすう', type: 'kanji' } },
  { lesson: 31, jp: '単体テスト', set: { kana: 'たんたいテスト', type: 'kanji' } },
  { lesson: 31, jp: '直近プロジェクト', set: { kana: 'ちょっきんプロジェクト', type: 'kanji' } },
  { lesson: 31, jp: '戻り値', set: { kana: 'もどりち', type: 'kanji' } },
  { lesson: 31, jp: '既存', set: { cn: '既存、现有' } },
  { lesson: 31, jp: '詳細設計', set: { cn: '详细设计' } },
  { lesson: 31, jp: '工程', set: { cn: '工程、工序' } },
]

const ADD_WORDS = [
  // 被折断而整条丢失的词
  { lesson: 4, after: null, word: { jp: 'WT', kana: 'ウォークスルー', cn: '走查', type: 'kanji' } },
  {
    lesson: 4,
    after: 'マニュアル',
    word: { jp: '取り扱い説明書', kana: 'とりあつかいせつめいしょ', cn: '操作说明书', type: 'kanji' },
  },
  {
    lesson: 9,
    after: '実行環境',
    word: { jp: 'オブジェクトファイル', kana: 'オブジェクトファイル', cn: '对象文件，目标文件', type: 'katakana' },
  },
  // 第31课补充词汇
  { lesson: 31, after: '引数、パラメータ', word: { jp: '引数', kana: 'ひきすう', cn: '参数、自变量', type: 'kanji' } },
  { lesson: 31, after: '引数', word: { jp: 'パラメータ', kana: 'パラメータ', cn: '参数', type: 'katakana' } },
]

for (const f of DROP_WORDS) {
  const l = result.find((x) => x.id === f.lesson)
  if (l) l.words = l.words.filter((w) => !f.jp.test(w.jp))
}
for (const f of PATCH_WORDS) {
  const l = result.find((x) => x.id === f.lesson)
  const w = l?.words.find((x) => x.jp === f.jp)
  if (w) Object.assign(w, f.set)
  else report.push(`[FIX] 找不到要修正的词: L${f.lesson} ${f.jp}`)
}
for (const f of ADD_WORDS) {
  const l = result.find((x) => x.id === f.lesson)
  if (!l) {
    report.push(`[FIX] 找不到课次: L${f.lesson}`)
    continue
  }
  if (l.words.some((w) => w.jp === f.word.jp)) continue
  const idx = f.after ? l.words.findIndex((w) => w.jp === f.after) : -1
  if (idx >= 0) l.words.splice(idx + 1, 0, f.word)
  else l.words.unshift(f.word)
}

/** 7. 全部词条解析完后再体检(此时折行续接已完成) */
for (const l of result) {
  for (const w of l.words) {
    if (!w.cn) report.push(`[L${l.id}] 无中文: ${w.jp} (${w.kana})`)
    if (w.type === 'raw') report.push(`[L${l.id}] 无假名: ${w.jp} / ${w.cn}`)
    if (/[A-Za-z]/.test(w.jp)) report.push(`[L${l.id}] 词形含英文: ${w.jp} (${w.kana}) / ${w.cn}`)
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ lessons: result }, null, 1), 'utf8')

const total = result.reduce((n, l) => n + l.words.length, 0)
let md = `# 词汇解析报告\n\n共 ${result.length} 课, ${total} 个词条\n\n| 课 | 标题 | 词条数 |\n| --- | --- | --- |\n`
for (const l of result) md += `| ${l.id} | ${l.title} | ${l.words.length} |\n`
md += `\n## 需要人工确认 (${report.length})\n\n` + report.map((r) => `- ${r}`).join('\n') + '\n'
fs.writeFileSync(path.join(__dirname, 'parse-report.md'), md, 'utf8')

console.log(`lessons: ${result.length}, words: ${total}, issues: ${report.length}`)
for (const r of report) console.log(r)
