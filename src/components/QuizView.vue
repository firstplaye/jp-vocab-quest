<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { judge, hintFor, shuffle } from '../utils/kana.js'
import { convert, finalize } from '../utils/romaji.js'
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
/**
 * 内置输入法的原始输入(已经确定的假名 + 末尾还没打完的罗马字)。
 * 显示 / 提交时都由 romaji.js 现算, 所以退格、中段修改都不会算错。
 */
const raw = ref('')
/** 系统输入法正在组字(此时不插手, 等它提交后再过滤) */
const composing = ref(false)
const feedback = ref(null)
const streak = ref(0)
const bestStreak = ref(0)
const firstResults = ref([])
const hinted = ref(false)
const inputEl = ref(null)

/**
 * 触屏设备需要软键盘, 只能用真实 <input>;
 * 非触屏则改用不可编辑的展示区接管键盘事件 —— 系统输入法(IME)对非可编辑元素
 * 不生效, 因此打字时绝不会弹出候选 / 联想窗, 也就不需要"禁用"系统输入法。
 */
const useNativeInput =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

const seen = new Set()
const retried = new Set()

const current = computed(() => queue.value[index.value] ?? null)
const total = computed(() => queue.value.length)
const doneCount = computed(() => index.value)
const correctFirst = computed(() => firstResults.value.filter((r) => r.ok).length)

/** 这道题该输出哪种假名: 片假名单词(如 コピー)就用片假名, 其余用平假名 */
const kanaScript = computed(() => {
  const kana = current.value?.kana ?? ''
  return /[\u30A1-\u30FA]/.test(kana) && !/[\u3041-\u3096]/.test(kana) ? 'katakana' : 'hiragana'
})

/** 把原始输入过一遍内置输入法: { kana: 已确定的假名, pending: 没打完的罗马字 } */
const parts = computed(() => convert(raw.value, kanaScript.value))

/** 显示内容 = 已确定的假名 + 没打完的罗马字 */
const fieldText = computed(() => parts.value.kana + parts.value.pending)

/** 提交给 judge() 的答案(末尾没打完的罗马字会补完) */
const answerText = computed(() => finalize(raw.value, kanaScript.value))

const placeholder = computed(() =>
  kanaScript.value === 'katakana' ? '直接打罗马字，例：kopi- → コピー' : '直接打罗马字，例：ka → か'
)

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

onMounted(() => {
  focusInput()
  // 非触屏: 键盘事件挂在 window 上, 这样点过"提示/跳过"按钮之后继续打字也不会丢键
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))

/**
 * 键盘接管(非触屏路径)。输入框是不可编辑元素, 系统输入法不会介入,
 * 所以这里拿到的就是原始按键, 不会出现 IME 的候选/联想窗。
 */
function onWindowKeydown(e) {
  if (useNativeInput || props.mode !== 'input' || !current.value) return
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
  const el = e.target
  if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return

  if (e.key === 'Enter') {
    e.preventDefault()
    submit()
    return
  }
  if (e.key === 'Backspace') {
    e.preventDefault()
    raw.value = raw.value.slice(0, -1)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    raw.value = ''
    return
  }
  if (e.key === ' ') {
    if (el?.tagName === 'BUTTON') return // 空格留给按钮(键盘可访问性)
    e.preventDefault() // 空格会被转换器丢掉, 顺手阻止页面滚动
    return
  }
  if ([...e.key].length === 1) {
    // 单个可打印字符: 交给内置输入法, 认不出的字符(汉字等)会被自动丢掉
    e.preventDefault()
    raw.value += e.key
  }
}

/** 粘贴(非触屏路径): 只接受假名和罗马字, 其余字符照样过滤掉 */
function onPaste(e) {
  const text = e.clipboardData?.getData('text') ?? ''
  const { kana, pending } = convert(raw.value + text, kanaScript.value)
  raw.value = kana + pending
}

/**
 * 触屏路径: 输入框是真实 <input>, 每次输入都从它的完整内容重算(幂等),
 * 所以退格、粘贴、光标跳转都能正确处理。
 */
function applyRaw(el) {
  const { kana, pending } = convert(el.value, kanaScript.value)
  const text = kana + pending
  raw.value = text
  if (el.value !== text) {
    el.value = text
    el.setSelectionRange?.(text.length, text.length)
  }
}

function onInput(e) {
  if (composing.value) return // 系统输入法正在组字, 等它提交后再处理
  applyRaw(e.target)
}

function onCompositionEnd(e) {
  composing.value = false
  applyRaw(e.target)
}

function onEnter(e) {
  if (composing.value) return // 回车交给输入法确认候选, 不算提交
  e.preventDefault()
  submit()
}

function next() {
  feedback.value = null
  raw.value = ''
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
  const typed = answerText.value
  const r = judge(typed, w.kana)

  if (r.status === 'empty') return

  if (r.status === 'kanaType') {
    feedback.value = { status: 'kanaType', need: r.need, typed }
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
        <!-- 非触屏: 不可编辑的展示区 + window 键盘事件。
             系统输入法对非可编辑元素不生效, 所以这里打字不会弹出 IME 候选/联想窗 -->
        <div
          v-if="!useNativeInput"
          ref="inputEl"
          class="answer-input answer-display jp"
          :class="{
            ok: feedback?.status === 'correct',
            bad: feedback?.status === 'wrong',
          }"
          tabindex="0"
          role="textbox"
          aria-readonly="true"
          :aria-label="placeholder"
          @paste.prevent="onPaste"
        >
          <template v-if="fieldText">
            <span>{{ parts.kana }}</span>
            <span class="pending">{{ parts.pending }}</span>
          </template>
          <span v-else class="answer-ph">{{ placeholder }}</span>
          <span class="caret" aria-hidden="true" />
        </div>

        <!-- 触屏: 需要软键盘, 用真实 <input>, 非假名字符同样会被吃掉 -->
        <input
          v-else
          ref="inputEl"
          :value="fieldText"
          class="answer-input jp"
          lang="ja"
          type="text"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="done"
          :placeholder="placeholder"
          :class="{
            ok: feedback?.status === 'correct',
            bad: feedback?.status === 'wrong',
          }"
          @input="onInput"
          @compositionstart="composing = true"
          @compositionend="onCompositionEnd"
          @keydown.enter="onEnter"
        />
        <p class="ime-note">直接打罗马字，不用切换输入法；非假名字符会被忽略</p>
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
          <span class="jp">{{ feedback.typed }}</span>
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
