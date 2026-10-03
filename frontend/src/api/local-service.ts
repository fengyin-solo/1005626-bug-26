import { MODULE_BY_KEY } from '@/data/modules'
import { hasAbnormalCell, resolveCell } from '@/data/emergency-domain'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  DispatchInput,
  EmergencyPanel,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 抢修单的在途状态：这些状态下同一管段不允许再派第二条。
const ACTIVE_REPAIR_STATUSES = ['待派修', '抢修中']
// 巡检台账里由抢修办结回写产生的编号前缀，回写时靠它做幂等。
const PATROL_VERIFY_PREFIX = 'VERIFY-EMER-'
// 抢修办结后回写巡检的待核实状态与核实办结动作，与 modules 元数据保持一致。
const PATROL_PENDING_VERIFY = '待核实'

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  // 不再因为恢复时间等字段缺失就过滤掉整行：缺项的单子照常取出来，格子上逐个说明原因。
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

function isClosed(meta: ModuleMeta, status: string): boolean {
  const closed = meta.closedStatuses ?? [meta.statuses[meta.statuses.length - 1]]
  return closed.includes(status)
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayStamp(): string {
  return nowStamp().slice(0, 10)
}

// 办结回写到巡检待核实台账：同一抢修单只回写一条，重复点「确认恢复」不会多出第二条。
function syncRepairClosureToPatrol(repair: EntryRow): void {
  const patrolKey = 'stationpatrol'
  const patrolRows = listRows(patrolKey)
  const repairCode = String(repair['抢修编号'] ?? repair.id)
  const verifyNo = `${PATROL_VERIFY_PREFIX}${repairCode}`
  const summary = `抢修单 ${repairCode} 已恢复，待现场核实（管段：${repair['故障管段'] ?? '未登记'}）`

  const existing = patrolRows.find((row) => String(row['巡检编号']) === verifyNo)
  if (existing) {
    return
  }

  const nextId = patrolRows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const record: EntryRow = {
    id: nextId,
    status: PATROL_PENDING_VERIFY,
    pending: true,
    abnormal: false,
    巡检编号: verifyNo,
    巡检站点: String(repair['故障管段'] ?? '未定位管段'),
    巡检路线: '抢修办结复核',
    巡检人: String(repair['抢修队'] ?? '待指派抢修队'),
    巡检日期: todayStamp(),
    发现问题数: 0,
    整改期限: '',
    办结结果: summary,
    巡检状态: '抢修办结，待现场核实',
  }
  saveRows(patrolKey, [...patrolRows, record])
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const allowedFrom = meta.actionFrom?.[action]
  if (allowedFrom && !allowedFrom.includes(current)) {
    return {
      ok: false,
      message: `当前是「${current}」，不能执行「${action}」（仅「${allowedFrom.join('、')}」可发起）`,
    }
  }

  // 确认恢复时若现场还没回填恢复时间，按办结时刻补上，详情与面板读到的是同一份数据。
  const patch: EntryRow = { ...rows[index] }
  if (key === 'emergencyrepair' && action === '确认恢复' && !String(patch['恢复时间'] ?? '').trim()) {
    patch['恢复时间'] = nowStamp()
  }

  const updated: EntryRow = {
    ...patch,
    status: target,
    pending: !isClosed(meta, target),
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)

  if (meta.writeback?.action === action) {
    syncRepairClosureToPatrol(updated)
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 登记派修：同一管段只要还有在途抢修单，就拦下重复提交，不会生成第二条。
export function createRepairDispatch(input: DispatchInput): ActionResult {
  const key = 'emergencyrepair'
  const meta = moduleMeta(key)
  const pipe = input.故障管段?.trim() ?? ''
  const kind = input.故障类型?.trim() ?? ''
  if (!pipe) {
    return { ok: false, message: '故障管段为必填项，无法派修' }
  }
  if (!kind) {
    return { ok: false, message: '故障类型为必填项，无法派修' }
  }

  const rows = listRows(key)
  const duplicate = rows.find(
    (row) =>
      String(row['故障管段'] ?? '').trim() === pipe &&
      ACTIVE_REPAIR_STATUSES.includes(String(row.status)),
  )
  if (duplicate) {
    return {
      ok: false,
      message: `管段「${pipe}」已有${duplicate.status}抢修单 ${String(duplicate['抢修编号'] ?? duplicate.id)}，不能重复派修`,
    }
  }

  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const seq = String(nextId).padStart(4, '0')
  const record: EntryRow = {
    id: nextId,
    status: '待派修',
    pending: true,
    abnormal: false,
    抢修编号: `EMER-${seq}`,
    故障管段: pipe,
    故障类型: kind,
    影响面积: input.影响面积?.trim() ?? '',
    抢修队: input.抢修队?.trim() ?? '',
    到场时间: '',
    恢复时间: '',
    抢修状态: '待派修',
  }
  saveRows(key, [...rows, record])
  return { ok: true, message: `已登记抢修单 EMER-${seq}，管段「${pipe}」待派修` }
}

// 夜间值守面板：缺恢复时间的单子也照常在列表里；本月恢复只认状态「已恢复」，已升级不混入。
export function loadEmergencyPanel(): EmergencyPanel {
  const meta = moduleMeta('emergencyrepair')
  const items = listRows(meta.key)
  const monthPrefix = todayStamp().slice(0, 7)
  const stats = [
    { label: '待派修故障', value: items.filter((row) => String(row.status) === '待派修').length },
    { label: '抢修中故障', value: items.filter((row) => String(row.status) === '抢修中').length },
    {
      label: '本月恢复数',
      value: items.filter(
        (row) =>
          String(row.status) === '已恢复' &&
          String(row['恢复时间'] ?? '').startsWith(monthPrefix),
      ).length,
    },
  ]
  return { stats, items }
}

// 抢修列表的行级异常：按抢修域规则逐格判定（面积非数值/负值、到场与恢复时间倒挂等）。
export function isRepairRowAbnormal(row: EntryRow): boolean {
  return hasAbnormalCell(row, moduleMeta('emergencyrepair').fields)
}

export function repairCellIssue(row: EntryRow, field: string) {
  return resolveCell(row, field)
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
