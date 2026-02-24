import { ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import { extractPeaks } from '../services/media';

export function registerMediaIpc(): void {
  ipcMain.handle('media:read-file', (_event, filePath: string) => {
    return readFileSync(filePath);
  });

  ipcMain.handle('media:extract-peaks', async (_event, filePath: string) => {
    return extractPeaks(filePath);
  });
}
