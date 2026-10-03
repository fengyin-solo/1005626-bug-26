import { listRows, saveRows } from './local-store'
import type { EntryRow } from './types'

const LEDGER_KEY = 'stationpatrol'
const VERIFY_STATUS = '待核实'

function today(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

function ledgerFields(repair: EntryRow): Record<string, string> {
  const repairNo = String(repair['抢修编号'] ?? repair.id)
  return {
    关联抢修: repairNo,
    巡检站点: `抢修现场（${String(repair['故障管段'] ?? '未登记管段')}）`,
    巡检路线: '抢修办结复核',
    巡检人: repair['抢修队'] ? `抢修队：${String(repair['抢修队'])}` : '',
    巡检日期: today(),
    发现问题数: '',
    整改期限: '',
    巡检状态: VERIFY_STATUS,
  }
}

// 抢修办结结果回写到巡检的待核实台账。
// 同一抢修单无论确认恢复提交几次，都只对应台账里的一条记录（按抢修编号幂等）。
export function writebackVerifyLedger(repair: EntryRow): { created: boolean; ledgerId: number } {
  const rows = [...listRows(LEDGER_KEY)]
  const repairNo = String(repair['抢修编号'] ?? repair.id)
  const existingIndex = rows.findIndex((row) => String(row['关联抢修'] ?? '') === repairNo)

  if (existingIndex >= 0) {
    const existing = rows[existingIndex]
    rows[existingIndex] = {
      ...existing,
      ...ledgerFields(repair),
      status: VERIFY_STATUS,
      pending: true,
      abnormal: false,
    }
    saveRows(LEDGER_KEY, rows)
    return { created: false, ledgerId: Number(existing.id) }
  }

  const ledgerId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const row: EntryRow = {
    id: ledgerId,
    status: VERIFY_STATUS,
    pending: true,
    abnormal: false,
    巡检编号: `VERF-${String(ledgerId).padStart(4, '0')}`,
    ...ledgerFields(repair),
  }
  rows.push(row)
  saveRows(LEDGER_KEY, rows)
  return { created: true, ledgerId }
}
