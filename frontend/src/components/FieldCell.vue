<template>
  <span v-if="issue.state === 'ok'">{{ issue.value || '—' }}</span>
  <span v-else :class="['cell-issue', issue.state]">
    <span class="cell-mark">{{ issue.state === 'missing' ? '缺' : '异' }}</span>
    <span class="cell-reason">{{ issue.reason }}</span>
  </span>
</template>

<script setup lang="ts">
import type { CellIssue } from '@/data/types'

defineProps<{ issue: CellIssue }>()
</script>
