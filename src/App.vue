<script setup>
import { ref, watch } from 'vue'
import lessonsData from './data/lessons.json'
import HomeView from './components/HomeView.vue'
import QuizView from './components/QuizView.vue'
import ResultView from './components/ResultView.vue'
import WrongBookView from './components/WrongBookView.vue'
import { useProgress, keyOf } from './composables/useProgress.js'
import { shuffle } from './utils/kana.js'

const MODE_KEY = 'jp-vocab-quest/mode'
const lessons = lessonsData.lessons
const progress = useProgress()

const view = ref('home')
const mode = ref(localStorage.getItem(MODE_KEY) || 'input')
const session = ref(null)
const result = ref(null)

watch(mode, (v) => {
  try {
    localStorage.setItem(MODE_KEY, v)
  } catch {
    /* ignore */
  }
})

const withLesson = (l) => l.words.map((w) => ({ ...w, lessonId: l.id }))
const allWords = lessons.flatMap(withLesson)

/** 该词是否已经答对过(答错会被重新标记为未掌握) */
const isMastered = (w) => !!progress.state.mastered[keyOf(w.lessonId ?? 0, w.jp)]

/**
 * 生成本轮答题会话
 * 规则: 已经答对的词不再进入新一轮; 如果该范围内已全部答对, 则退回复习全部
 * @param {{lessonId:number, baseTitle:string, source:Array, limit?:number, filterMastered?:boolean, mode:string}} opts
 */
function buildSession({ lessonId, baseTitle, source, limit = Infinity, filterMastered = true, mode: m }) {
  const pending = filterMastered ? source.filter((w) => !isMastered(w)) : source
  const reviewing = filterMastered && !pending.length && source.length > 0
  const pool = pending.length ? pending : source
  return {
    lessonId,
    baseTitle,
    source,
    limit,
    filterMastered,
    mode: m,
    words: shuffle(pool).slice(0, limit),
    title: reviewing ? `${baseTitle}（复习·已全部答对）` : baseTitle,
  }
}

function startSession(opts) {
  const s = buildSession(opts)
  if (!s.words.length) return
  session.value = s
  view.value = 'quiz'
}

function startLesson(id) {
  const l = lessons.find((x) => x.id === id)
  if (!l) return
  startSession({
    lessonId: id,
    baseTitle: `第${id}课 ${l.title}`,
    source: withLesson(l),
    mode: mode.value,
  })
}

function startRandom() {
  startSession({
    lessonId: 0,
    baseTitle: '随机挑战',
    source: allWords,
    limit: 20,
    mode: mode.value,
  })
}

function startWrong() {
  const list = progress.wrongList.value
  if (!list.length) return
  startSession({
    lessonId: 0,
    baseTitle: `错题重练（${list.length}）`,
    source: list.map((w) => ({
      jp: w.jp,
      kana: w.kana,
      cn: w.cn,
      type: w.type,
      lessonId: w.lessonId,
    })),
    // 错题本就是专门练没记住的词, 不按"已掌握"过滤
    filterMastered: false,
    mode: mode.value,
  })
}

function onFinish(res) {
  result.value = res
  view.value = 'result'
}

function retry() {
  if (!session.value) return startRandom()
  // 重来一遍时重新过滤: 刚答对的词不再出现
  session.value = buildSession(session.value)
  view.value = 'quiz'
}

function resetAll() {
  if (confirm('确定要清空所有进度和错题吗？此操作不可撤销。')) {
    progress.resetAll()
    view.value = 'home'
  }
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-logo jp">あ</div>
      <div>
        日语词汇闯关
        <small>JP VOCAB QUEST</small>
      </div>
    </div>
    <div style="display: flex; gap: 8px">
      <button v-if="view !== 'home'" class="btn btn-ghost" @click="view = 'home'">首页</button>
      <button class="btn btn-ghost" title="清空进度" @click="resetAll">⚙︎</button>
    </div>
  </header>

  <HomeView
    v-if="view === 'home'"
    v-model:mode="mode"
    @start-lesson="startLesson"
    @start-random="startRandom"
    @start-wrong="startWrong"
    @open-wrong="view = 'wrong'"
  />

  <QuizView
    v-else-if="view === 'quiz' && session"
    :key="session.title + session.words.length + session.mode"
    :lesson-id="session.lessonId"
    :title="session.title"
    :words="session.words"
    :pool="allWords"
    :mode="session.mode"
    @finish="onFinish"
    @exit="view = 'home'"
  />

  <ResultView
    v-else-if="view === 'result' && result"
    :result="result"
    @retry="retry"
    @home="view = 'home'"
    @review="view = 'wrong'"
  />

  <WrongBookView v-else-if="view === 'wrong'" @practice="startWrong" @home="view = 'home'" />

  <p class="footer-note">
    词库来自《软件工程师日语词汇表》，共 {{ lessons.length }} 课。进度保存在本机浏览器中。<br />
    汉字词输入平假名，外来语输入片假名（写平假名也算对）· 已答对的词下次不再出现 · 手机可用日语输入法直接作答
  </p>
</template>
