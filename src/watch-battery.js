'use strict'

const batteryLevel = require('battery-level')
const events = require('events')
const event = new events.EventEmitter()

const lowBattery = 0.1

let interval = null
let emitted = false

function handleBatteryLevel () {
  batteryLevel()
    .then((level) => {
      if (level <= lowBattery && !emitted) {
        event.emit('batteryLow')
        emitted = true
      } else if (level > lowBattery && emitted) {
        emitted = false
      }
    })
}

function startWatching () {
  if (!interval) {
    interval = setInterval(handleBatteryLevel, 60000)
  }
}

function stopWatching () {
  if (interval) {
    clearInterval(interval)
    interval = null
    emitted = false
  }
}

module.exports = {
  startWatching,
  stopWatching,
  event
}
