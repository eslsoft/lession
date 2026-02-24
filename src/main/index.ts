import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getDatabase, closeDatabase } from './db';
import { registerSeriesIpc } from './ipc/series.ipc';
import { registerEpisodeIpc } from './ipc/episode.ipc';
import { registerTranscriptIpc } from './ipc/transcript.ipc';
import { registerDownloadIpc } from './ipc/download.ipc';
import { registerConfigIpc } from './ipc/config.ipc';
import { registerSplitterIpc } from './ipc/splitter.ipc';
import { registerPublisherIpc } from './ipc/publisher.ipc';
import { registerDialogIpc } from './ipc/dialog.ipc';
import { registerMediaIpc } from './ipc/media.ipc';
import { registerMediaScheme, registerMediaProtocol } from './protocol';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Must be called before app.whenReady().
registerMediaScheme();

// Register all IPC handlers
function registerAllIpc(): void {
  registerSeriesIpc();
  registerEpisodeIpc();
  registerTranscriptIpc();
  registerDownloadIpc();
  registerConfigIpc();
  registerSplitterIpc();
  registerPublisherIpc();
  registerDialogIpc();
  registerMediaIpc();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f0f0f0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  registerMediaProtocol();

  // Initialize database
  getDatabase();

  // Register IPC handlers
  registerAllIpc();

  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});
