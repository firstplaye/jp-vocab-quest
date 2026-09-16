/** 平假名 ⇄ 片假名 互转与答题判定 */

/** 平假名 → 片假名 */
export const toKatakana = (s = '') =>
  s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

/** 片假名 → 平假名 */
export const toHiragana = (s = '') =>
  s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

/** 是否含片假名 */
export const hasKatakana = (s = '') => /[\u30A0-\u30FF]/.test(s)

/** 是否含汉字 */
export const hasKanji = (s = '') => /[\u4E00-\u9FFF]/.test(s)

/**
 * 归一化: 忽略空白 / 全角半角 / 常见标点差异, 但保留平假名与片假名的区别
 */
export function normalize(s = '') {
  return String(s)
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[・･]/g, '')
    .replace(/[。、，,.!！?？「」『』（）()［］\[\]…~～]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

/**
 * 判定用户输入
 * @returns {{status:'empty'|'correct'|'kanaType'|'wrong', need?:string}}
 */
export function judge(input, answer) {
  const i = normalize(input)
  const a = normalize(answer)
  if (!i) return { status: 'empty' }
  if (i === a) return { status: 'correct' }
  // 只是平假名 / 片假名用错了
  if (toHiragana(i) === toHiragana(a)) {
    return { status: 'kanaType', need: hasKatakana(answer) ? '片假名' : '平假名' }
  }
  return { status: 'wrong' }
}

/**
 * 提示: 返回答案的前若干假名 + 剩余用 ○ 占位
 */
export function hintFor(answer, count = 1) {
  const chars = [...answer]
  return chars.map((c, i) => (i < count ? c : '○')).join('')
}

/** 打乱数组(不改原数组) */
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
