import { listRows } from './local-store'
import type { CellState, EntryRow } from './types'

// 抢修单的唯一数据入口：抢修详情弹窗与夜班面板都从这里读到场时间，两处必须一致。
export function listRepairs(): EntryRow[] {
  return listRows('emergencyrepair')
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

// 影响面积必须是正数；非数值、零或负数都属数值异常，单独标出来。
export function isAbnormalArea(area: unknown): boolean {
  if (isBlank(area)) {
    return false
  }
  const num = Number(String(area).replace(/㎡|平方米/g, '').trim())
  return !Number.isFinite(num) || num <= 0
}

// 恢复时间早于到场时间在物理上不成立，按数值异常标出。
export function isRecoveryBeforeArrival(row: EntryRow): boolean {
  const arrival = String(row['到场时间'] ?? '').trim()
  const recovery = String(row['恢复时间'] ?? '').trim()
  if (!arrival || !recovery) {
    return false
  }
  const a = Date.parse(arrival.replace(/\//g, '-'))
  const r = Date.parse(recovery.replace(/\//g, '-'))
  return Number.isFinite(a) && Number.isFinite(r) && r < a
}

// 缺哪一格给哪一格的原因；异常值不走缺项文案，单独高亮。
export function repairCell(row: EntryRow, column: string): CellState {
  const raw = row[column]
  const blank = isBlank(raw)
  const state: CellState = {
    text: blank ? '' : String(raw),
    missing: false,
    reason: '',
    abnormal: false,
  }

  if (column === '影响面积') {
    if (blank) {
      state.missing = true
      state.reason = '影响面积缺项：现场尚未丈量回填'
    } else if (isAbnormalArea(raw)) {
      state.abnormal = true
      state.text = String(raw)
      state.reason = '影响面积数值异常：需为大于 0 的数值'
    }
    return state
  }

  if (column === '到场时间') {
    if (blank) {
      state.missing = true
      state.reason = '到场时间缺项：抢修队尚未到场回填'
    }
    return state
  }

  if (column === '恢复时间') {
    if (blank) {
      state.missing = true
      state.reason =
        String(row.status) === '已升级'
          ? '恢复时间缺项：该单已上报升级，尚未恢复'
          : '恢复时间缺项：抢修未办结，恢复后回填'
    } else if (isRecoveryBeforeArrival(row)) {
      state.abnormal = true
      state.reason = '时间异常：恢复时间早于到场时间'
    }
    return state
  }

  if (blank) {
    state.missing = true
    state.reason = `${column}缺项：现场尚未回填`
  }
  return state
}

// 只要有一个异常格，整行就值得夜班值守多看一眼。
export function rowHasIssue(row: EntryRow): boolean {
  return isAbnormalArea(row['影响面积']) || isRecoveryBeforeArrival(row)
}

export function isClosed(row: EntryRow): boolean {
  return String(row.status) === '已恢复'
}

// 面板只盯还没恢复的单子：待派修、抢修中、已升级都在跟办范围内。
export function activeRepairs(): EntryRow[] {
  return listRepairs().filter((row) => !isClosed(row))
}

function monthOf(value: string): string {
  const time = Date.parse(value.replace(/\//g, '-'))
  if (!Number.isFinite(time)) {
    return ''
  }
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// 本月恢复数只认真实的「已恢复」单；已升级的单子没有恢复时间，绝不能算进来。
export function monthRecoveredCount(rows: EntryRow[] = listRepairs(), now: Date = new Date()): number {
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return rows.filter(
    (row) =>
      String(row.status) === '已恢复' &&
      !isBlank(row['恢复时间']) &&
      monthOf(String(row['恢复时间'])) === current,
  ).length
}
