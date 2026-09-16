<script setup>
import { computed } from 'vue'

const props = defineProps({
  result: { type: Object, required: true },
})
const emit = defineEmits(['retry', 'home', 'review'])

const rate = computed(() => (props.result.total ? props.result.correct / props.result.total : 0))
const pct = computed(() => Math.round(rate.value * 100))

const rank = computed(() => {
  const p = pct.value
  if (p === 100) return { icon: '🏆', text: '满分通关！' }
  if (p >= 90) return { icon: '🎉', text: '非常棒！' }
  if (p >= 80) return { icon: '🏅', text: '通关成功！' }
  if (p >= 60) return { icon: '💪', text: '差一点就通关了' }
  return { icon: '📚', text: '再练一遍会更好' }
})
</script>

<template>
  <section class="card result-hero">
    <div style="font-size: 44px">{{ rank.icon }}</div>
    <div class="result-score">{{ pct }}%</div>
    <p class="muted" style="margin: 6px 0 0">
      {{ rank.text }}　{{ result.title }}<br />
      答对 {{ result.correct }} / {{ result.total }} 题（首答）
      <span v-if="result.bestStreak >= 2">　最高连击 🔥{{ result.bestStreak }}</span>
    </p>
  </section>

  <div v-if="result.wrong.length" class="section-title"><span>本轮错题（{{ result.wrong.length }}）</span></div>
  <div v-if="result.wrong.length" class="wrong-list">
    <div v-for="w in result.wrong" :key="w.jp" class="wrong-item">
      <div>
        <div class="jp" style="font-size: 17px">{{ w.jp }}</div>
        <div class="muted" style="font-size: 12px; margin-top: 2px">{{ w.cn }}</div>
      </div>
      <div class="kana jp">{{ w.kana }}</div>
    </div>
  </div>
  <div v-else class="card empty">全部答对，太厉害了！🎊</div>

  <div class="quiz-actions">
    <button class="btn btn-ghost" @click="emit('home')">返回首页</button>
    <button class="btn btn-ghost" @click="emit('review')">📕 错题本</button>
    <button class="btn btn-primary" @click="emit('retry')">再来一关</button>
  </div>
</template>
