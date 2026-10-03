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
  /** 动作允许从哪些状态发起；不登记的动作沿用「只要目标态不同就可执行」的既有做法。 */
  actionFrom?: Record<string, string[]>
  /** 视为办结的状态；不登记时沿用「状态序列最后一个」的既有做法。 */
  closedStatuses?: string[]
  /** 动作办结后要回写的目标业务模块。 */
  writeback?: { action: string; targetModule: string }
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

/** 派修登记表单的入参。 */
export type DispatchInput = {
  故障管段: string
  故障类型: string
  影响面积?: string
  抢修队?: string
}

/** 抢修面板的夜间值守统计：已升级不计入恢复。 */
export type EmergencyPanel = {
  stats: { label: string; value: number }[]
  items: EntryRow[]
}

/** 一个格子的展示结论：正常、缺项（附原因）、异常（附原因）。 */
export type CellIssue = {
  state: 'ok' | 'missing' | 'abnormal'
  reason: string
  value: string
}
