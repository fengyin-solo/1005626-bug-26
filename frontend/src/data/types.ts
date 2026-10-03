/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  // 视为办结的状态：落在其中的记录不再算待处理。缺省仍取最后一个状态，兼容旧模块。
  closedStatuses?: string[]
  // 动作的起始状态限制：只有当前状态在名单里才允许执行；缺省则沿用只看目标状态的旧做法。
  actionFrom?: Record<string, string[]>
}

// 表格单元格的展示状态：缺项要给原因，异常要单独标出。
export type CellState = {
  text: string
  missing: boolean
  reason: string
  abnormal: boolean
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
