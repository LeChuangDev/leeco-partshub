// electron/main.mjs
// Electron 主进程：启动内置本地服务（静态资源 + /api + FileKV），再加载离线前端。
// 数据保存在系统用户数据目录下的 data/local-kv.json，与线上 EdgeOne KV 完全隔离。
import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import { join } from 'node:path'
import { startLocalServer } from './local-server.mjs'

let local = null
let mainWindow = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(bootstrap).catch((e) => {
    dialog.showErrorBox('启动失败', String((e && e.message) || e))
    app.quit()
  })
}

async function bootstrap() {
  const rootDir = join(app.getAppPath(), 'dist-offline')
  const dataDir = join(app.getPath('userData'), 'data')
  local = await startLocalServer({ rootDir, kvFile: join(dataDir, 'local-kv.json') })
  buildMenu(dataDir)
  createWindow(`http://127.0.0.1:${local.port}/#/dashboard`)
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: '樂創元件库 Leeco PartsHub',
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadURL(url)
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

function buildMenu(dataDir) {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开数据目录', click: () => shell.openPath(dataDir) },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => dialog.showMessageBox({
            type: 'info',
            title: '关于',
            message: '樂創元件库 Leeco PartsHub',
            detail: '离线桌面版 · 数据保存在本机，不会上传。'
          })
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('window-all-closed', () => {
  if (local) local.close().catch(() => {})
  local = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow && local) createWindow(`http://127.0.0.1:${local.port}/#/dashboard`)
})

app.on('before-quit', () => {
  if (local) local.close().catch(() => {})
  local = null
})
