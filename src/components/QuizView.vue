<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { judge, hintFor, shuffle } from '../utils/kana.js'
import { useProgress } from '../composables/useProgress.js'

const props = defineProps({
  lessonId: { type: Number, required: true },
  title: { type: String, default: '' },
  words: { type: Array, required: true },
  // 干扰项候选池(通常是全部词库), 用于词池过小时补足选项
  pool: { type: Array, default: () => [] },
  mode: { type: String, default: 'input' }, // input | choice
  limit: { type: Number, default: 20 },
})

const emit = defineEmits(['finish', 'exit'])

const progress = useProgress()

/** 同一个词只保留一次, 避免答对过的词重复出现 */
const uniqByJp = (arr) => {
  const m = new Map()
  for (const w of arr) if (!m.has(w.jp)) m.set(w.jp, w)
  return [...m.values()]
}

const queue = ref(shuffle(uniqByJp(props.words)).slice(0, props.limit))
const index = ref(0)
const input = ref('')
const feedback = ref(null)
const streak = ref(0)
const bestStreak = ref(0)
const firstResults = ref([])
const hinted = ref(false)
const inputEl = ref(null)

const seen = new Set()
const retried = new Set()

const current = computed(() => queue.value[index.value] ?? null)
const total = computed(() => queue.value.length)
const doneCount = computed(() => index.value)
const correctFirst = computed(() => firstResults.value.filter((r) => r.ok).length)

const options = computed(() => {
  const w = current.value
  if (!w) return []
  const uniq = (arr) => {
    const m = new Map()
    for (const x of arr) if (x.jp !== w.jp && !m.has(x.jp)) m.set(x.jp, x)
    return [...m.values()]
  }
  const all = uniq([...props.words, ...props.pool])
  const sameType = all.filter((x) => x.type === w.type)
  // 优先用同类型的词做干扰项, 不够再从全部词里取
  const candidates = sameType.length >= 3 ? sameType : all
  return shuffle([w, ...shuffle(candidates).slice(0, 3)])
})

function focusInput() {
  nextTick(() => inputEl.value?.focus())
}

onMounted(focusInput)

function next() {
  feedback.value = null
  input.value = ''
  hinted.value = false
  if (index.value + 1 >= queue.value.length) {
    finish()
    return
  }
  index.value += 1
  focusInput()
}

function record(ok) {
  const w = current.value
  const lid = w.lessonId ?? props.lessonId
  const isFirst = !seen.has(w.jp)
  if (isFirst) {
    seen.add(w.jp)
    firstResults.value.push({ jp: w.jp, kana: w.kana, cn: w.cn, ok })
  }
  progress.recordAnswer(lid, w, ok)
  progress.setMastered(lid, w, ok)
  if (!ok) {
    progress.pushWrong(lid, w)
    // 答错的词排到队尾再来一遍(只重来一次)
    if (!retried.has(w.jp)) {
      retried.add(w.jp)
      queue.value = [...queue.value, w]
    }
  }
}

function submit() {
  if (feedback.value && feedback.value.status !== 'kanaType') {
    next()
    return
  }
  const w = current.value
  if (!w) return
  const r = judge(input.value, w.kana)

  if (r.status === 'empty') return

  if (r.status === 'kanaType') {
    feedback.value = { status: 'kanaType', need: r.need }
    return
  }

  if (r.status === 'correct') {
    streak.value += 1
    bestStreak.value = Math.max(bestStreak.value, streak.value)
    feedback.value = { status: 'correct', kanaAlt: !!r.kanaAlt }
    record(true)
    setTimeout(() => {
      if (feedback.value?.status === 'correct') next()
    }, 650)
  } else {
    streak.value = 0
    feedback.value = { status: 'wrong', answer: w.kana }
    record(false)
  }
}

function choose(opt) {
  if (feedback.value && feedback.value.status !== 'kanaType') return
  const w = current.value
  if (opt.jp === w.jp) {
    streak.value += 1
    bestStreak.value = Math.max(bestStreak.value, streak.value)
    feedback.value = { status: 'correct', picked: opt.jp }
    record(true)
    setTimeout(() => {
      if (feedback.value?.status === 'correct') next()
    }, 650)
  } else {
    streak.value = 0
    feedback.value = { status: 'wrong', answer: w.kana, picked: opt.jp }
    record(false)
  }
}

function useHint() {
  hinted.value = true
  streak.value = 0
  focusInput()
}

function skip() {
  if (!feedback.value || feedback.value.status === 'kanaType') {
    streak.value = 0
    feedback.value = { status: 'wrong', answer: current.value.kana, skipped: true }
    record(false)
    return
  }
  next()
}

function finish() {
  const results = firstResults.value
  const wrong = results.filter((r) => !r.ok).map((r) => ({ jp: r.jp, kana: r.kana, cn: r.cn }))
  // 只有正式关卡(>0)才记录通关成绩, 随机挑战/错题重练不记录
  if (props.lessonId > 0) {
    progress.finishLesson(props.lessonId, {
      total: results.length,
      correct: results.filter((r) => r.ok).length,
      mode: props.mode,
    })
  }
  emit('finish', {
    title: props.title,
    total: results.length,
    correct: results.filter((r) => r.ok).length,
    wrong,
    bestStreak: bestStreak.value,
    mode: props.mode,
  })
}

const optionClass = (opt) => {
  if (!feedback.value || feedback.value.status === 'kanaType') return ''
  const isAnswer = opt.jp === current.value.jp
  if (feedback.value.status === 'wrong' && opt.jp === feedback.value.picked) return 'bad'
  if (isAnswer) return 'ok'
  return ''
}
</script>

<template>
  <div v-if="current">
    <div class="quiz-head">
      <button class="btn btn-ghost" @click="emit('exit')">← 退出</button>
      <div class="progress-line">
        <i :style="{ width: ((doneCount + 1) / total) * 100 + '%' }" />
      </div>
      <span class="idx">{{ doneCount + 1 }} / {{ total }}</span>
    </div>

    <div class="card quiz-card">
      <div class="quiz-tag">
        <span class="pill">{{ title }}</span>
        <span v-if="streak >= 2" class="pill streak">🔥 连击 {{ streak }}</span>
      </div>

      <div class="jp quiz-cn">{{ current.cn }}</div>
      <div class="jp quiz-hintword">
        <template v-if="mode === 'input' && hinted">{{ hintFor(current.kana, 1) }}</template>
      </div>

      <template v-if="mode === 'input'">
        <input
          ref="inputEl"
          v-model="input"
          class="answer-input jp"
          lang="ja"
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="current.type === 'katakana' ? '在此输入片假名（平假名也算对）' : '在此输入平假名'"
          :class="{
            ok: feedback?.status === 'correct',
            bad: feedback?.status === 'wrong',
          }"
          @keydown.enter.prevent="submit"
        />
      </template>

      <div v-else class="choice-grid">
        <button
          v-for="opt in options"
          :key="opt.jp"
          class="choice jp"
          :class="optionClass(opt)"
          :disabled="!!feedback && feedback.status !== 'kanaType'"
          @click="choose(opt)"
        >
          {{ opt.jp }}
        </button>
      </div>

      <div v-if="feedback" class="feedback" :class="feedback.status === 'wrong' ? 'bad' : feedback.status === 'correct' ? 'ok' : ''">
        <template v-if="feedback.status === 'correct'">
          ✅ 正确！<span class="jp">{{ current.jp }}</span>
          <span v-if="current.kana !== current.jp" class="jp-mini">（{{ current.kana }}）</span>
          <div v-if="feedback.kanaAlt" class="jp-mini">外来语通常写作片假名，平假名也接受</div>
        </template>
        <template v-else-if="feedback.status === 'kanaType'">
          ⚠️ 假名种类不对，本题需要输入<strong>{{ feedback.need }}</strong>。你写的是：
          <span class="jp">{{ input }}</span>
        </template>
        <template v-else>
          ✗ 正确答案：<span class="answer jp">{{ feedback.answer }}</span>
          <div class="jp-mini jp">
            <template v-if="current.jp !== current.kana">词形：{{ current.jp }}　</template>释义：{{ current.cn }}
          </div>
        </template>
      </div>

      <div class="quiz-actions">
        <template v-if="mode === 'input'">
          <button class="btn btn-ghost" :disabled="!!feedback && feedback.status !== 'kanaType'" @click="useHint">
            💡 提示
          </button>
          <button class="btn btn-ghost" @click="skip">跳过</button>
          <button
            class="btn btn-primary"
            :disabled="feedback?.status === 'wrong' ? false : feedback?.status === 'correct'"
            @click="submit"
          >
            {{ feedback?.status === 'wrong' ? '下一题 →' : '确定' }}
          </button>
        </template>
        <template v-else>
          <button class="btn btn-primary" :disabled="!feedback || feedback.status === 'kanaType'" @click="next">
            下一题 →
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
