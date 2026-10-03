import type { CellIssue, EntryRow } from './types'

// 抢修域规则：面板（运营概览）和抢修详情/列表都从这里取每一格的结论，
// 保证两处读到的「到场时间」完全一致，缺项原因也只有一份口径。

function rawText(row: EntryRow, field: string): string {
  const value = row[field]
  if (value === undefined || value === null) {
    return ''
  }
  return String(value).trim()
}

function parseDateTime(text: string): number | null {
  if (!text) {
    return null
  }
  const time = new Date(text.replace(/\//g, '-')).getTime()
  return Number.isNaN(time) ? null : time
}

function okCell(value: string): CellIssue {
  return { state: 'ok', reason: '', value }
}

function missingCell(reason: string): CellIssue {
  return { state: 'missing', reason, value: '' }
}

function abnormalCell(value: string, reason: string): CellIssue {
  return { state: 'abnormal', reason, value }
}

// 到场时间的统一读法：详情、面板、CSV 之外的所有展示都走这里，不允许各写各的格式。
export function formatArrival(row: EntryRow): string {
  return rawText(row, '到场时间')
}

function resolveStatus(text: string): CellIssue {
  if (!text) {
    return missingCell('状态未流转，未回写')
  }
  return okCell(text)
}

function resolveArrival(row: EntryRow, text: string): CellIssue {
  const status = String(row.status ?? '')
  if (!text) {
    if (status === '待派修') {
      return missingCell('尚未派出抢修，无到场记录')
    }
    return missingCell('抢修队未回填到场时间，需联系现场补录')
  }
  if (parseDateTime(text) === null) {
    return abnormalCell(text, '到场时间格式无法识别，请按「YYYY-MM-DD HH:mm」补录')
  }
  const recovery = rawText(row, '恢复时间')
  const recoveryTime = parseDateTime(recovery)
  if (recoveryTime !== null && parseDateTime(text)! > recoveryTime) {
    return abnormalCell(text, '到场时间晚于恢复时间，时间线不合理，请现场核对')
  }
  return okCell(text)
}

function resolveRecovery(row: EntryRow, text: string): CellIssue {
  const status = String(row.status ?? '')
  if (!text) {
    if (status === '已升级') {
      return missingCell('已上报升级，由上级单位接管，本单不再登记恢复时间')
    }
    if (status === '已恢复') {
      return missingCell('状态已办结但恢复时间未回填，需立即补录')
    }
    return missingCell('故障尚未恢复，恢复时间待现场回填')
  }
  if (parseDateTime(text) === null) {
    return abnormalCell(text, '恢复时间格式无法识别，请按「YYYY-MM-DD HH:mm」补录')
  }
  const arrival = rawText(row, '到场时间')
  const arrivalTime = parseDateTime(arrival)
  if (arrivalTime !== null && arrivalTime > parseDateTime(text)!) {
    return abnormalCell(text, '恢复时间早于到场时间，时间线不合理，请现场核对')
  }
  return okCell(text)
}

function resolveArea(text: string): CellIssue {
  if (!text) {
    return missingCell('影响范围未估测，待抢修队到场后补登')
  }
  const numeric = Number(text.replace(/[㎡平方米,\s]/g, ''))
  if (Number.isNaN(numeric)) {
    return abnormalCell(text, '影响面积不是数值，无法纳入停供统计，请核实补登')
  }
  if (numeric < 0) {
    return abnormalCell(text, '影响面积为负数，数值不合理')
  }
  return okCell(text)
}

function resolveRequired(emptyReason: string, text: string): CellIssue {
  if (!text) {
    return missingCell(emptyReason)
  }
  return okCell(text)
}

const RESOLVERS: Partial<Record<string, (row: EntryRow, text: string) => CellIssue>> = {
  抢修状态: (_row, text) => resolveStatus(text),
  到场时间: resolveArrival,
  恢复时间: resolveRecovery,
  影响面积: (_row, text) => resolveArea(text),
  故障管段: (_row, text) => resolveRequired('故障管段未定位，待现场确认后补登', text),
  故障类型: (_row, text) => resolveRequired('故障类型未判定，待现场确认后补登', text),
  抢修队: (_row, text) => resolveRequired('抢修队未指派，派修时补登', text),
  抢修编号: (_row, text) => resolveRequired('抢修编号缺失，台账无法归档', text),
}

/** 取抢修单某一格的展示结论（正常/缺项原因/异常原因）。 */
export function resolveCell(row: EntryRow, field: string): CellIssue {
  const text = rawText(row, field)
  const resolver = RESOLVERS[field]
  if (resolver) {
    return resolver(row, text)
  }
  return text ? okCell(text) : missingCell('该栏信息未登记')
}

/** 一行里只要有任意一格异常，行级就要在面板上单独标出来。 */
export function hasAbnormalCell(row: EntryRow, fields: string[]): boolean {
  return fields.some((field) => resolveCell(row, field).state === 'abnormal')
}
