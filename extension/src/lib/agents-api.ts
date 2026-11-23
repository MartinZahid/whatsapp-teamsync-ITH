// Lista de agentes dados de alta, leída del servidor (tabla `agents`).
//
// El servidor la expone en HTTP:  GET http://<host>:3001/api/agentes
// La URL se saca de la del WebSocket (ws://… -> http://…, wss://… -> https://…).
// Si el servidor no responde, se usa la última lista guardada (caché).

import { getAgentsList, saveAgentsList } from './storage'

export function agentsUrl(serverUrl: string): string {
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = '/api/agentes'
  url.search = ''
  return url.toString()
}

// Devuelve los nombres y si vienen del servidor (true) o de la caché (false).
export async function fetchAgentNames(serverUrl: string): Promise<{ names: string[]; fromServer: boolean }> {
  try {
    const response = await fetch(agentsUrl(serverUrl), { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as { name: string }[]
    const names = data.map((agent) => agent.name)
    await saveAgentsList(names)
    return { names, fromServer: true }
  } catch {
    return { names: await getAgentsList(), fromServer: false }
  }
}
