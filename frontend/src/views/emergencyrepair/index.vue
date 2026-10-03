<template>
  <section class="page" data-module="emergencyrepair">
    <header class="page-head">
      <div>
        <h2>抢修处置管理</h2>
        <p class="page-desc">维护抢修记录，围绕抢修编号、故障管段、故障类型、影响面积做登记、筛选与状态流转。缺项的单子照常显示，缺哪一格当场说明原因。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="showForm = !showForm">登记抢修记录</button>
        <button class="btn" type="button" @click="exportRows">导出抢修处置清单</button>
      </div>
    </header>

    <form v-if="showForm" class="form-card" @submit.prevent="submitDispatch">
      <div class="form-grid">
        <div class="form-item">
          <label>故障管段 *</label>
          <input v-model="form.故障管段" placeholder="如：滨河西路DN300" />
        </div>
        <div class="form-item">
          <label>故障类型 *</label>
          <input v-model="form.故障类型" placeholder="如：管网泄漏" />
        </div>
        <div class="form-item">
          <label>影响面积（㎡）</label>
          <input v-model="form.影响面积" placeholder="到场估测后可补登" />
        </div>
        <div class="form-item">
          <label>抢修队</label>
          <input v-model="form.抢修队" placeholder="派出时指派" />
        </div>
        <button class="btn primary" type="submit">提交派修</button>
        <button class="btn ghost" type="button" @click="showForm = false">取消</button>
      </div>
      <p class="form-tip">同一管段还有待派修/抢修中的单子时，重复提交会被拦下，不会生成第二条。</p>
    </form>

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

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="rowClass(row)">
          <td v-for="column in columns" :key="column">
            <FieldCell :issue="cellIssue(row, column)" />
          </td>
          <td>
            {{ row.status }}
            <span v-if="rowAbnormal(row)" class="badge-abnormal">数值异常</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">抢修详情</button>
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
      <span>共 {{ total }} 条抢修处置记录；<span class="badge-missing">缺</span> 缺项已注明原因，<span class="badge-abnormal">异</span> 数值异常单独标出</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="successMessage" style="color: #067647">{{ successMessage }}</span>
    </footer>

    <template v-if="detailRow">
      <div class="detail-mask" @click="detailRow = null"></div>
      <aside class="detail-panel" role="dialog" aria-label="抢修详情">
        <button class="btn detail-close" type="button" @click="detailRow = null">关闭</button>
        <h3>抢修详情 · {{ detailRow['抢修编号'] }}</h3>
        <p class="page-desc">到场时间与夜间值守面板读取同一份记录，缺项、异常逐格注明。</p>
        <table class="detail-grid">
          <tbody>
            <tr v-for="column in columns" :key="column">
              <th>{{ column }}</th>
              <td><FieldCell :issue="cellIssue(detailRow, column)" /></td>
            </tr>
            <tr>
              <th>当前状态</th>
              <td>{{ detailRow.status }}</td>
            </tr>
          </tbody>
        </table>
      </aside>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import FieldCell from '@/components/FieldCell.vue'
import {
  createRepairDispatch,
  downloadEntries,
  isRepairRowAbnormal,
  listEntries,
  loadEmergencyPanel,
  moduleMeta,
  repairCellIssue,
  runAction as applyAction,
} from '@/api/local-service'
import type { DispatchInput, EntryRow } from '@/data/types'

const meta = moduleMeta('emergencyrepair')
const columns = ['抢修编号', '故障管段', '故障类型', '影响面积', '抢修队', '到场时间', '恢复时间', '抢修状态']
const actions = ['派出抢修', '确认恢复', '上报升级']
const statuses = ['待派修', '抢修中', '已恢复', '已升级']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const stats = ref<{ label: string; value: number }[]>([])
const errorMessage = ref('')
const successMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const showForm = ref(false)
const detailRow = ref<EntryRow | null>(null)
const form = ref<DispatchInput>({ 故障管段: '', 故障类型: '', 影响面积: '', 抢修队: '' })

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function cellIssue(row: EntryRow, field: string) {
  return repairCellIssue(row, field)
}

function rowAbnormal(row: EntryRow): boolean {
  return isRepairRowAbnormal(row)
}

function rowClass(row: EntryRow): Record<string, boolean> {
  return { 'row-abnormal': rowAbnormal(row) }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function submitDispatch() {
  errorMessage.value = ''
  successMessage.value = ''
  const result = createRepairDispatch({ ...form.value })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  successMessage.value = result.message
  form.value = { 故障管段: '', 故障类型: '', 影响面积: '', 抢修队: '' }
  showForm.value = false
  reload()
}

function openDetail(row: EntryRow) {
  // 详情读的是列表里的同一条数据（同一个 id、同一份存储），到场时间不会两边对不上。
  const latest = listEntries(meta.key).items.find((item) => Number(item.id) === Number(row.id))
  detailRow.value = latest ?? row
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  successMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  successMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    stats.value = loadEmergencyPanel().stats
    if (detailRow.value) {
      const latest = payload.items.find((item) => Number(item.id) === Number(detailRow.value!.id))
      if (latest) {
        detailRow.value = latest
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '抢修处置列表读取失败'
  }
}

onMounted(reload)
</script>
