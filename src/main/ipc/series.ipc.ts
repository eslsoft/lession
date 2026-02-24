import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { listSeries, getSeries, createSeries, updateSeries, deleteSeries } from '../db/repositories/series'
import type { Series } from '../../shared/types'

export function registerSeriesIpc(): void {
  ipcMain.handle(IPC.SERIES_LIST, () => {
    return listSeries()
  })

  ipcMain.handle(IPC.SERIES_GET, (_event, id: string) => {
    return getSeries(id)
  })

  ipcMain.handle(IPC.SERIES_CREATE, (_event, data: Omit<Series, 'id' | 'createdAt' | 'updatedAt'>) => {
    return createSeries(data)
  })

  ipcMain.handle(IPC.SERIES_UPDATE, (_event, id: string, data: Partial<Series>) => {
    return updateSeries(id, data)
  })

  ipcMain.handle(IPC.SERIES_DELETE, (_event, id: string) => {
    deleteSeries(id)
  })
}
