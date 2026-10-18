// Service worker de la extensión (punto de entrada en segundo plano).
// En este paso solo comprueba que arranca y mantiene un latido.

console.log('[WTS] service worker iniciado')

chrome.runtime.onInstalled.addListener(() => {
  console.log('[WTS] extensión instalada')
})

chrome.alarms.create('wts-heartbeat', { periodInMinutes: 0.5 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'wts-heartbeat') console.log('[WTS] latido del service worker')
})
