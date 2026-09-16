<script setup>
import { computed } from 'vue'
import lessonsData from '../data/lessons.json'
import { useProgress } from '../composables/useProgress.js'

const props = defineProps({
  mode: { type: String, default: 'input' },
})
const emit = defineEmits(['update:mode', 'start-lesson', 'start-wrong', 'start-random', 'open-wrong'])

const lessons = lessonsData.lessons
const progress = useProgress()

const totalWords = computed(() => lessons.reduce((n, l) => n + l.words.length, 0))
const mastered = progress.totalMastered
const accuracy = progress.accuracy
const wrongCount = computed(() => progress.wrongList.value.length)

const statOf = (id) => progress.lessonStat(id)
const masteredOf = (id, total) => {
  const n = progress.masteredCount(id)
  return { n, pct: total ? Math.round((n / total) * 100) : 0 }
}
const titleOf = (l) => `第${l.id}课 ${l.title}`
</script>

<template>
  <section class="card hero">
    <h1>软件工程师日语词汇闯关 🎯</h1>
    <p>
      按课设置关卡，共 <b>{{ lessons.length }}</b> 关、<b>{{ totalWords }}</b> 个词条。
      看到中文释义，写出对应的日语：汉字词写<b>平假名</b>，外来语写<b>片假名</b>。
    </p>
    <div class="stat-row">
      <div class="stat">
        <b>{{ mastered }}</b>
        <span>已掌握词条</span>
      </div>
      <div class="stat">
        <b>{{ totalWords }}</b>
        <span>词条总数</span>
      </div>
      <div class="stat">
        <b>{{ accuracy }}%</b>
        <span>累计正确率</span>
      </div>
    </div>

    <div class="mode-row">
      <button class="mode-chip" :class="{ active: props.mode === 'input' }" @click="emit('update:mode', 'input')">
        ✍️ 写假名
      </button>
      <button class="mode-chip" :class="{ active: props.mode === 'choice' }" @click="emit('update:mode', 'choice')">
        🀄 选择题
      </button>
      <button class="mode-chip" @click="emit('start-random')">🎲 随机挑战</button>
      <button class="mode-chip" @click="emit('open-wrong')">
        📕 错题本<span v-if="wrongCount">（{{ wrongCount }}）</span>
      </button>
    </div>
  </section>

  <div class="section-title">
    <span>选择关卡</span>
    <span v-if="wrongCount" class="link" style="cursor: pointer" @click="emit('start-wrong')">
      只练错题（{{ wrongCount }}）→
    </span>
  </div>

  <div class="lesson-grid">
    <button v-for="l in lessons" :key="l.id" class="card lesson-card" @click="emit('start-lesson', l.id)">
      <span v-if="statOf(l.id).cleared" class="badge-clear">🏅</span>
      <div class="lesson-no">第 {{ l.id }} 课</div>
      <div class="lesson-title">{{ l.title }}</div>
      <div class="bar">
        <i :style="{ width: masteredOf(l.id, l.words.length).pct + '%' }" />
      </div>
      <div class="lesson-meta">
        <span>{{ masteredOf(l.id, l.words.length).n }} / {{ l.words.length }} 词</span>
        <span v-if="statOf(l.id).best">最佳 {{ Math.round(statOf(l.id).best * 100) }}%</span>
        <span v-else>未闯关</span>
      </div>
    </button>
  </div>
</template>
