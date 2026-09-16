import { computed, reactive, watch } from 'vue'

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
    return { ...emptyState(), ...JSON.parse(raw) }
  } catch {
    return emptyState()
  }
}

const state = reactive(load())

watch(
  state,
  (s) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* 隐私模式下忽略 */
    }
  },
  { deep: true },
)

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
