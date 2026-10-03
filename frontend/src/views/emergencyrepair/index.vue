<template>
  <section class="page" data-module="emergencyrepair">
    <header class="page-head">
      <div>
        <h2>抢修处置管理</h2>
        <p class="page-desc">维护抢修记录，围绕抢修编号、故障管段、故障类型、影响面积做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记抢修记录</button>
        <button class="btn" type="button" @click="exportRows">导出抢修处置清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <!-- 夜班值守面板：到场时间与抢修详情读同一个数据源（listRepairs），两处保持一致 -->
    <section class="duty-panel">
      <h3 class="duty-title">夜班值守面板 · 跟办中的抢修单</h3>
      <p v-if="!panelRows.length" class="duty-empty">当前没有待派修、抢修中或已升级的单子，今夜平稳。</p>
      <div v-else class="duty-grid">
        <article
          v-for="row in panelRows"
          :key="String(row.id)"
          class="duty-card"
          :class="{ 'is-abnormal': rowHasIssue(row) }"
        >
          <header class="duty-card-head">
            <strong>{{ String(row['抢修编号']) }}</strong>
            <span class="duty-status" :data-status="String(row.status)">{{ String(row.status) }}</span>
          </header>
          <dl class="duty-fields">
            <div><dt>故障管段</dt><dd>{{ repairCell(row, '故障管段').text || '未登记管段' }}</dd></div>
            <div v-for="column in panelColumns" :key="column">
              <dt>{{ column }}</dt>
              <dd>
                <span
                  v-if="repairCell(row, column).abnormal"
                  class="cell-abnormal"
                  :title="repairCell(row, column).reason"
                >
                  {{ repairCell(row, column).text }}<em>⚠ {{ repairCell(row, column).reason }}</em>
                </span>
                <span v-else-if="repairCell(row, column).missing" class="cell-missing" :title="repairCell(row, column).reason">
                  缺项<em>{{ repairCell(row, column).reason }}</em>
                </span>
                <template v-else>{{ repairCell(row, column).text }}</template>
              </dd>
            </div>
          </dl>
          <button class="link" type="button" @click="openDetail(row)">查看抢修详情</button>
        </article>
      </div>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table repair-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-abnormal': rowHasIssue(row) }">
          <td v-for="column in columns" :key="column">
            <span
              v-if="repairCell(row, column).abnormal"
              class="cell-abnormal"
              :title="repairCell(row, column).reason"
            >
              {{ repairCell(row, column).text }}<em>⚠ {{ repairCell(row, column).reason }}</em>
            </span>
            <span v-else-if="repairCell(row, column).missing" class="cell-missing" :title="repairCell(row, column).reason">
              缺项<em>{{ repairCell(row, column).reason }}</em>
            </span>
            <template v-else>{{ repairCell(row, column).text }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无抢修处置数据，可先登记抢修记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条抢修处置记录；缺项格注明回填原因，数值异常格红色标出</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 抢修详情：到场时间与面板同源，展示同一份数据 -->
    <div v-if="detailRow" class="modal-mask" @click.self="closeDetail">
      <div class="modal" role="dialog" aria-modal="true" aria-label="抢修详情">
        <header class="modal-head">
          <h3>抢修详情 · {{ String(detailRow['抢修编号']) }}</h3>
          <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
        </header>
        <table class="data-table detail-table">
          <tbody>
            <tr v-for="column in columns" :key="column">
              <th>{{ column }}</th>
              <td>
                <span
                  v-if="repairCell(detailRow, column).abnormal"
                  class="cell-abnormal"
                  :title="repairCell(detailRow, column).reason"
                >
                  {{ repairCell(detailRow, column).text }}<em>⚠ {{ repairCell(detailRow, column).reason }}</em>
                </span>
                <span
                  v-else-if="repairCell(detailRow, column).missing"
                  class="cell-missing"
                  :title="repairCell(detailRow, column).reason"
                >
                  缺项<em>{{ repairCell(detailRow, column).reason }}</em>
                </span>
                <template v-else>{{ repairCell(detailRow, column).text }}</template>
              </td>
            </tr>
            <tr>
              <th>当前状态</th>
              <td>{{ detailRow.status }}</td>
            </tr>
          </tbody>
        </table>
        <footer class="modal-foot">
          <span v-if="lastMessage" :class="lastOk ? 'ok-text' : 'error-text'">{{ lastMessage }}</span>
          <div class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="btn"
              type="button"
              @click="runAction(action, detailRow)"
            >
              {{ action }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  activeRepairs,
  monthRecoveredCount,
  repairCell,
  rowHasIssue,
} from '@/data/repair'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('emergencyrepair')
const columns = ["抢修编号", "故障管段", "故障类型", "影响面积", "抢修队", "到场时间", "恢复时间", "抢修状态"]
const actions = ["派出抢修", "确认恢复", "上报升级"]
const statuses = ["待派修", "抢修中", "已恢复", "已升级"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
// 面板卡片展示的关键格；故障管段在卡片头部单独展示。
const panelColumns = columns.filter(
  (column) => !['抢修编号', '故障管段', '故障类型', '抢修状态'].includes(column),
)

const stats = computed(() => {
  const all = activeRepairs()
  return [
    { label: '待派修故障', value: rows.value.filter((row) => String(row.status) === '待派修').length },
    { label: '抢修中故障', value: rows.value.filter((row) => String(row.status) === '抢修中').length },
    { label: '本月恢复数', value: monthRecoveredCount(rows.value) },
    { label: '面板跟办单数', value: all.length },
  ]
})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 面板只取未恢复的跟办单；缺恢复时间、已升级的单子都不会从这里消失。
const panelRows = computed(() => activeRepairs())

const detailId = ref<number | null>(null)
const detailRow = computed<EntryRow | null>(
  () => activeRepairs().concat(rows.value).find((row) => Number(row.id) === detailId.value) ?? null,
)
const lastMessage = ref('')
const lastOk = ref(true)

function openDetail(row: EntryRow) {
  detailId.value = Number(row.id)
  lastMessage.value = ''
}

function closeDetail() {
  detailId.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeDetail()
  }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '抢修记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    lastMessage.value = result.message
    lastOk.value = false
    return
  }
  lastMessage.value = result.message
  lastOk.value = true
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '抢修处置列表读取失败'
  }
}

onMounted(() => {
  reload()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
