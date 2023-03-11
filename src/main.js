'use strict'

const {
  app,
  Menu,
  Tray,
  BrowserWindow,
  powerSaveBlocker,
  powerMonitor,
  shell,
  systemPreferences,
  ipcMain
} = require('electron')

const path = require('path')
const Store = require('electron-store')
const { autoUpdater } = require('electron-updater')
const battery = require(path.join(__dirname, 'watch-battery.js'))
const strings = require(path.join(__dirname, 'strings.json'))

const defaults = {
  pref_left_click: false, // Activate on left click
  pref_display_sleep: true, // Allow display to sleep
  pref_low_power: false, // Deactivate on low power
  pref_charger: false, // Automatically activate when on ac power
  pref_battery_power: false, // Automatically deactivate on battery power
  pref_open_at_login: true, // Launch at login
  pref_startup: false, // Automatically activate on startup
  pref_sounds: true, // Play sound effects,
  flag_first_launch: true
}

const storage = new Store({ defaults })

let tray
let menu
let welcomeWin
let preferencesWin
let id = null
let timer = null
const storedData = {}

app.on('ready', function () {
  app.dock.hide()
  getUserPrefs()
  setupTray()
  buildMenu()
  registerListeners()
  setupAppSettings()
  initBatterySettings()
  showWelcomeWindowIfNeeded()
  autoUpdater.checkForUpdatesAndNotify()

  // Prevent app from closing completely if all windows are closed
  app.on('window-all-closed', (e) => {
    e.preventDefault()
  })
})

function getUserPrefs () {
  for (const key in defaults) {
    storedData[key] = storage.get(key)
  }
}

function setupTray () {
  tray = new Tray(path.join(__dirname, 'images', 'ic_tray_off_Template.png'))
}

function buildMenu () {
  const menuTemplate = []

  if (id !== null) {
    let activeMenu = [
      {
        label: strings.CANCEL_SESSION,
        accelerator: 'Command+D',
        click: () => releaseKeepAwake()
      }
    ]

    if (timer) {
      const time = getTimeRemaining()
      const minutes = getMinutes(time)
      const timeStr = getFormatted(minutes)

      const timerMenuItem = [
        {
          label: strings.KEEP_AWAKE + `: ${timeStr}`,
          enabled: false
        }
      ]

      activeMenu = timerMenuItem.concat(activeMenu)
    }

    menuTemplate.push(activeMenu)
  } else {
    const inactiveMenu = [
      {
        label: strings.STATUS_ACTIVE,
        accelerator: 'Command+A',
        click: () => keepAwake()
      },
      { type: 'separator' },
      {
        label: strings.ACTIVATE_FOR,
        enabled: false
      },
      {
        label: strings.DURATION_TEN_MINUTES,
        click: () => setTimer(10)
      },
      {
        label: strings.DURATION_THIRTY_MINUTES,
        click: () => setTimer(30)
      },
      {
        label: strings.DURATION_ONE_HOUR,
        click: () => setTimer(60)
      },
      {
        label: strings.DURATION_TWO_HOURS,
        click: () => setTimer(120)
      },
      {
        label: strings.DURATION_FOUR_HOURS,
        click: () => setTimer(240)
      },
      {
        label: strings.DURATION_EIGHT_HOURS,
        click: () => setTimer(480)
      },
      {
        label: strings.DURATION_TWELVE_HOURS,
        click: () => setTimer(720)
      }
    ]

    menuTemplate.push(inactiveMenu)
  }

  const preferencesMenu = [
    { type: 'separator' },
    {
      label: strings.PREFERENCES,
      accelerator: 'Command+,',
      click: () => showPreferencesWindow()
    },
    { type: 'separator' },
    {
      role: 'quit',
      label: strings.QUIT,
      accelerator: 'Command+Q'
    }
  ]

  menuTemplate.push(preferencesMenu)

  const finalTemplate = Array.prototype.concat(...menuTemplate)

  menu = Menu.buildFromTemplate(finalTemplate)

  if (!storedData.pref_left_click) {
    tray.setContextMenu(menu)
    tray.setIgnoreDoubleClickEvents(true)
  }
}

function getTimeRemaining () {
  const uptime = Math.ceil(process.uptime() * 1000)
  const timerStart = timer._idleStart
  const timerDuration = timer._idleTimeout

  return Math.ceil(timerStart + timerDuration - uptime)
}

function getMinutes (time) {
  return Math.floor(time / (1000 * 60))
}

function getFormatted (duration) {
  const formatted = []
  const hours = Math.floor(duration / 60)
  const minutes = duration % 60

  // Convert the number of hours to a string
  let hoursStr
  if (hours > 0) {
    hoursStr = `${hours} ${strings.HOUR}${hours > 1 ? 's' : ''}`
  }

  // Convert the number of minutes to a string
  let minutesStr
  if (minutes > 0) {
    minutesStr = `${minutes} ${strings.MINUTE}${minutes > 1 ? 's' : ''}`
  }

  if (hoursStr) {
    formatted.push(hoursStr)
  }
  if (minutesStr) {
    formatted.push(minutesStr)
  }

  return formatted.join(', ')
}

function setTimer (minutes) {
  timer = setTimeout(releaseKeepAwake, minutes * 60000)
  keepAwake()
}

function keepAwake () {
  if (storedData.pref_sounds) {
    shell.beep()
  }

  setPowerSaveBlockerMode(storedData.pref_display_sleep)
  buildMenu()
  tray.setImage(path.join(__dirname, 'images', 'ic_tray_on_Template.png'))
}

function setPowerSaveBlockerMode (status) {
  if (status === true) {
    id = powerSaveBlocker.start('prevent-app-suspension')
  } else {
    id = powerSaveBlocker.start('prevent-display-sleep')
  }
}

function releaseKeepAwake () {
  if (id === null) return

  if (storedData.pref_sounds) {
    shell.beep()
  }

  powerSaveBlocker.stop(id)
  id = null

  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }

  buildMenu()
  tray.setImage(path.join(__dirname, 'images', 'ic_tray_off_Template.png'))
}

function registerListeners () {
  // Listens for any change to preferences from renderers
  ipcMain.on('updatePreferences', (e, data) => {
    const key = data.key
    const value = data.value

    storage.set(key, value)
  })

  ipcMain.on('rendererButtonClicked', (e, data) => {
    const id = data

    switch (id) {
      case 'close_welcome_window':
        if (welcomeWin) {
          welcomeWin.close()
          welcomeWin = null
        }
        break
    }
  })

  tray.on('mousedown', (e) => {
    if (timer) {
      buildMenu()
    }
  })

  tray.on('click', (e) => {
    if (storedData.pref_left_click) {
      if (e.ctrlKey) {
        if (timer) {
          buildMenu()
        }

        tray.popUpContextMenu(menu)
      } else if (id === null) {
        keepAwake()
      } else {
        releaseKeepAwake()
      }
    }
  })

  tray.on('right-click', () => {
    if (storedData.pref_left_click) {
      if (timer) {
        buildMenu()
      }

      tray.popUpContextMenu(menu)
    }
  })

  powerMonitor.on('on-ac', () => {
    if (storedData.pref_charger === true && id === null) {
      keepAwake()
    }
  })

  powerMonitor.on('on-battery', () => {
    if (storedData.pref_battery === true && id) {
      releaseKeepAwake()
    }
  })

  battery.event.on('batteryLow', (e) => {
    if (storedData.pref_low_power === true && id) {
      releaseKeepAwake()
    }
  })

  powerMonitor.on('user-did-become-active', () => {
    const isOnBattery = powerMonitor.isOnBatteryPower()

    if (!isOnBattery && storedData.pref_charger === true && id === null) {
      keepAwake()
    } else if (isOnBattery && storedData.pref_battery === true && id) {
      releaseKeepAwake()
    }
  })

  storage.onDidAnyChange((result) => {
    for (const key in defaults) {
      storedData[key] = result[key]
    }
  })

  storage.onDidChange('pref_left_click', (status) => {
    toggleLeftClickFunctionality(status)
  })

  storage.onDidChange('pref_low_battery', (status) => {
    if (status === true) {
      battery.startWatching()
    } else {
      battery.stopWatching()
    }
  })

  storage.onDidChange('pref_display_sleep', (status) => {
    if (id !== null) {
      setPowerSaveBlockerMode(status)
    }
  })

  storage.onDidChange('pref_open_at_login', (status) => {
    setLoginSettings(status)
  })

  // Subscribe to system preference changes for accent color and update window accent color
  systemPreferences.subscribeNotification(
    'AppleAquaColorVariantChanged',
    () => {
      setTimeout(() => {
        const accentColor = getAccentColor()
        if (welcomeWin) {
          welcomeWin.webContents.send('updateAccentColor', accentColor)
        }
        if (preferencesWin) {
          preferencesWin.webContents.send('updateAccentColor', accentColor)
        }
      }, 250)
    }
  )
}

function getAccentColor () {
  const hexRgba = systemPreferences.getAccentColor()

  if (hexRgba) {
    return hexRgba.slice(0, -2)
  } else {
    return null
  }
}

function toggleLeftClickFunctionality (status) {
  if (status === true) {
    tray.setContextMenu(null)
    buildMenu()
  } else {
    buildMenu()
  }
}

function initBatterySettings () {
  // If connected to AC then activate
  const isOnBattery = powerMonitor.isOnBatteryPower()

  if (storedData.pref_charger === true && !isOnBattery && id === null) {
    keepAwake()
  }

  // If low battery option is selected then start watching battery
  if (storedData.pref_low_battery) {
    battery.startWatching()
  }
}

function setupAppSettings () {
  const openAtLoginStatus = app.getLoginItemSettings().openAtLogin
  const shouldActivate = storedData.pref_startup

  if (openAtLoginStatus !== storedData.pref_open_at_login) {
    setLoginSettings(storedData.pref_open_at_login)
  }

  if (shouldActivate) {
    keepAwake()
  }
}

function setLoginSettings (status) {
  app.setLoginItemSettings({
    openAtLogin: status
  })
}

function showWelcomeWindowIfNeeded () {
  // check if the application is being launched for the first time
  if (storedData.flag_first_launch === false) return

  // then update the flag
  storage.set('flag_first_launch', false)

  welcomeWin = new BrowserWindow({
    width: 380,
    height: 500,
    vibrancy: 'window',
    fullscreenable: false,
    resizable: false,
    frame: false,
    show: false,
    alwaysOnTop: true,
    minimizable: false,
    hiddenInMissionControl: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true
    }
  })

  preventZoom(welcomeWin)

  welcomeWin.loadFile(path.join(__dirname, 'welcome', 'welcome.html'))

  welcomeWin.once('ready-to-show', () => {
    welcomeWin.show()
  })

  welcomeWin.on('closed', () => {
    welcomeWin = null
  })

  welcomeWin.webContents.on('did-finish-load', () => {
    const accentColor = getAccentColor()
    if (accentColor) {
      welcomeWin.webContents.send('updateAccentColor', accentColor)
    } // If no accent color then send nothing / theme.css will take care of the fallback
    welcomeWin.webContents.send('loadPreferences', storedData)
  })

  welcomeWin.on('blur', () => {
    welcomeWin.webContents.send('stateChange', 'blur')
  })

  welcomeWin.on('focus', () => {
    welcomeWin.webContents.send('stateChange', 'focus')
  })
}

function showPreferencesWindow () {
  if (preferencesWin) {
    preferencesWin.show()
    return
  }

  preferencesWin = new BrowserWindow({
    width: 400,
    height: 359,
    vibrancy: 'window',
    titleBarStyle: 'hidden',
    fullscreenable: false,
    resizable: false,
    alwaysOnTop: true,
    minimizable: false,
    hiddenInMissionControl: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true
    }
  })

  preventZoom(preferencesWin)

  preferencesWin.loadFile(
    path.join(__dirname, 'preferences', 'preferences.html')
  )

  preferencesWin.once('ready-to-show', () => {
    preferencesWin.show()
  })

  preferencesWin.on('closed', () => {
    preferencesWin = null
  })

  preferencesWin.webContents.on('did-finish-load', () => {
    const accentColor = getAccentColor()
    if (accentColor) {
      preferencesWin.webContents.send('updateAccentColor', accentColor)
    } // theme.css handles fallback defaults
    preferencesWin.webContents.send('loadPreferences', storedData)
  })

  preferencesWin.on('blur', () => {
    preferencesWin.webContents.send('stateChange', 'blur')
  })

  preferencesWin.on('focus', () => {
    preferencesWin.webContents.send('stateChange', 'focus')
  })
}

function preventZoom (win) {
  win.webContents.on('before-input-event', (e, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === '=' || input.key === '-') &&
      (input.control || input.meta)
    ) {
      e.preventDefault()
    }
  })
}
