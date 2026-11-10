// src/shared/backup.ts
// 备份提醒的本地时间戳：只记录「最后一次全量导出」的时间，不上传任何数据。

const LAST_BACKUP_KEY = 'leeco_last_backup_at'

/** 记录一次全量备份完成（导出 JSON 成功后调用） */
export function markBackupDone(at = Date.now()) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(at))
  } catch {
    /* 隐私模式下 localStorage 不可用，忽略即可 */
  }
}

/** 距上次备份的天数；从未备份时返回 null */
export function daysSinceBackup(now = Date.now()): number | null {
  try {
    const raw = Number(localStorage.getItem(LAST_BACKUP_KEY))
    if (!raw) return null
    return Math.max(0, Math.floor((now - raw) / 86400000))
  } catch {
    return null
  }
}
