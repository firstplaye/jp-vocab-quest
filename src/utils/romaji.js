/**
 * 应用内置的「罗马字 → 假名」输入引擎。
 *
 * 浏览器没有办法控制、更没有办法关闭操作系统的输入法(IME)。所以这里干脆把
 * 答题输入框本身做成一个"输入法", 于是:
 *   - 直接打罗马字就行, 不需要切到系统的日文 IME, 也就不会弹出 IME 的预测 /
 *     联想候选窗;
 *   - 汉字、中文标点、emoji、空格等非假名字符一律被丢弃, 输入框里只可能出现假名;
 *   - 如果用户本来就用日文输入法(或手机输入法)打出了假名, 原样放行。
 */

import { toKatakana } from './kana.js'

/** 罗马字 → 平假名 对照表(匹配时按 key 长度降序, 长的优先) */
const TABLE = {
  // あ行
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  // か行 / が行
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  // さ行 / ざ行
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  // た行 / だ行
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  // な行
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  // は行 / ば行 / ぱ行
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  // ま行 / や行 / ら行 / わ行
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
  // ゔ / ふぁ行(外来语常用)
  vu: 'ゔ', va: 'ゔぁ', vi: 'ゔぃ', ve: 'ゔぇ', vo: 'ゔぉ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  // 拗音
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sya: 'しゃ', syu: 'しゅ', syo: 'しょ', sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ', ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  // 小写的假名
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ',
  xtu: 'っ', xtsu: 'っ', ltu: 'っ',
  xwa: 'ゎ',
  // 长音符
  '-': 'ー',
}

const KEYS = Object.keys(TABLE).sort((a, b) => b.length - a.length)

/** 全角英数 → 半角(用户可能在全角字母状态下打字) */
const toHalfWidth = (s) => s.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

/** 平假名 / 片假名(含长音符、繰り返し記号) */
const KANA_RE = /[\u3041-\u309F\u30A1-\u30FF]/
/** 内置输入法认得的字符: 字母、长音符、隔音撇号 */
const ROMAJI_RE = /[a-zA-Z\-']/
/** 促音: 除 n / y 之外的相同辅音, 例如 kk → っ */
const SOKUON_RE = /[bcdfghjklmpqrstvwxz]/
/** 元音(含 y, 用于判断「n」后面是拨音还是な行/にゃ行) */
const VOWEL_RE = /[aiueoy]/

/**
 * 把「罗马字 + 假名」的混合文本转换成假名。
 * @param {string} raw 输入框里的原始文本
 * @param {'hiragana'|'katakana'} [script] 输出哪种假名
 * @returns {{kana: string, pending: string}}
 *   kana: 已经能确定的假名; pending: 末尾还没打完的罗马字(例如只打了个 "k")
 */
export function convert(raw, script = 'hiragana') {
  const katakana = script === 'katakana'
  const emit = (k) => (katakana ? toKatakana(k) : k)

  let out = ''
  let buf = ''

  /** 尽可能把 buf 开头的罗马字转成假名, 转不动的留在 buf 里等下一个键 */
  const match = () => {
    while (buf) {
      const second = buf[1]

      // 促音: 「kk」→ っ, 剩下的 "k" 继续等
      if (second !== undefined && buf[0] === second && SOKUON_RE.test(buf[0])) {
        out += emit('っ')
        buf = buf.slice(1)
        continue
      }

      // 拨音: 「n'」/「nn」/「n + 辅音」→ ん
      if (buf[0] === 'n') {
        if (second === "'") {
          out += emit('ん')
          buf = buf.slice(2)
          continue
        }
        if (second === 'n') {
          const third = buf[2]
          // 末尾只有「nn」时先不急着判定: 打字到此可能是「ん」也可能是「んな」
          if (third === undefined) break
          // 「nna」= んな → 前一个 n 是 ん; 「nnp」= んぱ → 两个 n 一起是 ん
          out += emit('ん')
          buf = buf.slice(VOWEL_RE.test(third) ? 1 : 2)
          continue
        }
        if (second !== undefined && !VOWEL_RE.test(second)) {
          out += emit('ん')
          buf = buf.slice(1)
          continue
        }
      }

      // 对照表匹配(长 key 优先), 匹配不到说明还没打完
      const key = KEYS.find((k) => buf.startsWith(k))
      if (!key) break
      out += emit(TABLE[key])
      buf = buf.slice(key.length)
    }
  }

  for (const ch of toHalfWidth(String(raw ?? ''))) {
    if (KANA_RE.test(ch)) {
      // 真·输入法打出来的假名: 原样放行, 不改变假名种类
      out += ch
      buf = ''
      continue
    }
    if (ROMAJI_RE.test(ch)) {
      // 单独的隔音撇号(前面不是 n)没有意义, 直接忽略
      if (ch === "'" && !buf.endsWith('n')) continue
      buf += ch.toLowerCase()
      match()
      continue
    }
    // 其他字符(汉字、中文标点、空格、emoji …)一律丢弃
  }

  return { kana: out, pending: buf }
}

/**
 * 提交答案时用: 把末尾没打完的罗马字补完(「n」→「ん」), 其余不完整的忽略。
 * @param {string} raw 输入框里的原始文本
 * @param {'hiragana'|'katakana'} [script] 输出哪种假名
 * @returns {string} 最终答案
 */
export function finalize(raw, script = 'hiragana') {
  const { kana, pending } = convert(raw, script)
  if (!pending.endsWith('n')) return kana
  return kana + (script === 'katakana' ? 'ン' : 'ん')
}
