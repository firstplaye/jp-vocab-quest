import { computed, reactive, watch } from 'vue'
import lessonsData from '../data/lessons.json'

const STORAGE_KEY = 'jp-vocab-quest/v1'

function emptyState() {
  return {
    v: 1,
    // 每课记录: { best: 正确率, cleared: 是否通关, plays: 次数 }
    lessons: {},
    // 已掌握的词: "课号::词形" -> true
    mastered: {},
    // 错题本: "课号::词形" -> {...}
    wrong: {},
    totals: { answered: 0, correct: 0 },
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const s = { ...emptyState(), ...JSON.parse(raw) }
    syncWrong(s.wrong)
    return s
  } catch {
    return emptyState()
  }
}

/**
 * 错题本里存的是词条快照(读音/释义/类型), 词库修正过之后, 旧快照里的错误
 * 会一直留着(比如 データ型 的读音曾被存成「データ型」, 练习时照样答不对),
 * 所以加载时按当前词库把快照刷新一遍。词库里已经没有的词条保持原样。
 */
function syncWrong(wrong = {}) {
  const byKey = new Map()
  // 这里不能用下面的 keyOf(): 它要等 state 初始化完才存在, 而 syncWrong() 是 state 初始化时调的
  for (const l of lessonsData.lessons) for (const w of l.words) byKey.set(`${l.id}::${w.jp}`, w)
  for (const [k, v] of Object.entries(wrong)) {
    const cur = byKey.get(k)
    if (!cur) continue
    v.kana = cur.kana
    v.cn = cur.cn
    v.type = cur.type
  }
}

function persist(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式下忽略 */
  }
}

const state = reactive(load())

watch(state, persist, { deep: true })

// load() 里刷新错题本快照发生在 watch 建立之前, 不会触发上面的回写 ——
// 这里补一次, 免得用户只是打开页面(还没答题)时, 本地存的还是旧快照
persist(state)

export const keyOf = (lessonId, jp) => `${lessonId}::${jp}`

export function useProgress() {
  const lessonStat = (id) => state.lessons[id] ?? { best: 0, cleared: false, plays: 0 }

  const masteredCount = (id) =>
    Object.keys(state.mastered).filter((k) => k.startsWith(`${id}::`)).length

  const totalMastered = computed(() => Object.keys(state.mastered).length)

  const accuracy = computed(() => {
    const { answered, correct } = state.totals
    return answered ? Math.round((correct / answered) * 100) : 0
  })

  const wrongList = computed(() =>
    Object.values(state.wrong).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
  )

  function recordAnswer(lessonId, word, ok) {
    state.totals.answered += 1
    if (ok) state.totals.correct += 1
  }

  function setMastered(lessonId, word, ok) {
    const k = keyOf(lessonId, word.jp)
    if (ok) state.mastered[k] = true
    else delete state.mastered[k]
  }

  function pushWrong(lessonId, word) {
    const k = keyOf(lessonId, word.jp)
    const prev = state.wrong[k]
    state.wrong[k] = {
      lessonId,
      jp: word.jp,
      kana: word.kana,
      cn: word.cn,
      type: word.type,
      count: (prev?.count ?? 0) + 1,
      at: Date.now(),
    }
  }

  function removeWrong(lessonId, jp) {
    delete state.wrong[keyOf(lessonId, jp)]
  }

  function clearWrong() {
    state.wrong = {}
  }

  function finishLesson(id, { total, correct, mode }) {
    const acc = total ? correct / total : 0
    const prev = lessonStat(id)
    state.lessons[id] = {
      best: Math.max(prev.best ?? 0, acc),
      cleared: (prev.cleared ?? false) || acc >= 0.8,
      plays: (prev.plays ?? 0) + 1,
      mode: mode ?? prev.mode,
      at: Date.now(),
    }
  }

  function resetAll() {
    Object.assign(state, emptyState())
  }

  return {
    state,
    lessonStat,
    masteredCount,
    totalMastered,
    accuracy,
    wrongList,
    recordAnswer,
    setMastered,
    pushWrong,
    removeWrong,
    clearWrong,
    finishLesson,
    resetAll,
  }
}
