<script setup>
import { computed } from 'vue'
import { useProgress } from '../composables/useProgress.js'

const emit = defineEmits(['practice', 'home'])
const progress = useProgress()
const list = progress.wrongList

const titleOf = (id) => `第${id}课`
</script>

<template>
  <div class="section-title">
    <span>错题本（{{ list.length }}）</span>
    <button class="btn btn-ghost" @click="emit('home')">← 返回</button>
  </div>

  <div v-if="!list.length" class="card empty">还没有错题，先去闯几关吧 🚀</div>

  <template v-else>
    <div class="quiz-actions" style="margin-top: 0">
      <button class="btn btn-primary" @click="emit('practice')">🔁 只练这些错题</button>
      <button class="btn btn-ghost" @click="progress.clearWrong()">清空</button>
    </div>

    <div class="wrong-list" style="margin-top: 14px">
      <div v-for="w in list" :key="w.lessonId + w.jp" class="wrong-item">
        <div>
          <div class="jp" style="font-size: 17px">{{ w.jp }}</div>
          <div class="muted" style="font-size: 12px; margin-top: 2px">
            {{ w.cn }}　·　{{ titleOf(w.lessonId) }}<span v-if="w.count > 1">　·　错 {{ w.count }} 次</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px">
          <div class="kana jp">{{ w.kana }}</div>
          <button class="btn btn-ghost" style="padding: 6px 10px" @click="progress.removeWrong(w.lessonId, w.jp)">
            ✕
          </button>
        </div>
      </div>
    </div>
  </template>
</template>
