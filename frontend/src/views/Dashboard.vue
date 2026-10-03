<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <section class="page" style="padding: 0">
      <header class="page-head">
        <div>
          <h2 style="font-size: 15px; margin: 0">抢修夜间值守面板</h2>
          <p class="page-desc">缺恢复时间的单子也照常列出；到场时间与抢修详情同源；已升级不算已恢复；数值异常单独标出。</p>
        </div>
        <div class="page-actions">
          <RouterLink class="btn" to="/emergencyrepair">进入抢修处置</RouterLink>
        </div>
      </header>
      <div class="stat-row">
        <article v-for="item in repairStats" :key="item.label" class="stat-card">
          <span class="stat-label">{{ item.label }}</span>
          <strong class="stat-value">{{ item.value }}</strong>
        </article>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in repairColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in repairRows" :key="String(row.id)" :class="{ 'row-abnormal': repairAbnormal(row) }">
            <td v-for="column in repairColumns" :key="column">
              <FieldCell :issue="repairIssue(row, column)" />
            </td>
            <td>
              {{ row.status }}
              <span v-if="repairAbnormal(row)" class="badge-abnormal">数值异常</span>
            </td>
          </tr>
          <tr v-if="!repairRows.length">
            <td :colspan="repairColumns.length + 1" class="empty-state">暂无抢修值守数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <h2 style="font-size: 15px; margin: 18px 0 8px">各业务模块汇总</h2>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import FieldCell from '@/components/FieldCell.vue'
import {
  isRepairRowAbnormal,
  loadEmergencyPanel,
  loadOverview,
  repairCellIssue,
} from '@/api/local-service'
import type { EntryRow, OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const repairStats = ref<{ label: string; value: number }[]>([])
const repairRows = ref<EntryRow[]>([])
// 面板只聚焦夜班最关心的四栏；到场时间与抢修详情页用的是同一个 repairCellIssue。
const repairColumns = ['故障管段', '影响面积', '到场时间', '恢复时间']

function repairIssue(row: EntryRow, field: string) {
  return repairCellIssue(row, field)
}

function repairAbnormal(row: EntryRow): boolean {
  return isRepairRowAbnormal(row)
}

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  const panel = loadEmergencyPanel()
  repairStats.value = panel.stats
  repairRows.value = panel.items
}

onMounted(refresh)
</script>
