<script setup>
import { ref, watch } from 'vue'
import lessonsData from './data/lessons.json'
import HomeView from './components/HomeView.vue'
import QuizView from './components/QuizView.vue'
import ResultView from './components/ResultView.vue'
import WrongBookView from './components/WrongBookView.vue'
import { useProgress } from './composables/useProgress.js'
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

function startLesson(id) {
  const l = lessons.find((x) => x.id === id)
  if (!l) return
  session.value = {
    lessonId: id,
    title: `第${id}课 ${l.title}`,
    words: withLesson(l),
    mode: mode.value,
  }
  view.value = 'quiz'
}

function startRandom() {
  session.value = {
    lessonId: 0,
    title: '随机挑战',
    words: shuffle(allWords).slice(0, 20),
    mode: mode.value,
  }
  view.value = 'quiz'
}

function startWrong() {
  const list = progress.wrongList.value
  if (!list.length) return
  session.value = {
    lessonId: 0,
    title: `错题重练（${list.length}）`,
    words: list.map((w) => ({
      jp: w.jp,
      kana: w.kana,
      cn: w.cn,
      type: w.type,
      lessonId: w.lessonId,
    })),
    mode: mode.value,
  }
  view.value = 'quiz'
}

function onFinish(res) {
  result.value = res
  view.value = 'result'
}

function retry() {
  const s = session.value
  if (!s) return startRandom()
  session.value = { ...s, words: shuffle(s.words) }
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
    汉字词输入平假名，外来语输入片假名 · 手机可用日语输入法直接作答
  </p>
</template>
