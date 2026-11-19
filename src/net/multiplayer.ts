export type MultiplayerStatus = 'idle' | 'loading' | 'connecting' | 'connected' | 'disconnected' | 'error'

export type MultiplayerPlayer = {
  id: string
  name: string
  joinedAt?: number
  isSelf?: boolean
}

export type MultiplayerState = {
  status: MultiplayerStatus
  room: string
  playerId: string
  players: MultiplayerPlayer[]
  message: string
  error?: string
}

type Bootstrap = {
  build: string
  signalingUrl: string
  maxPlayers: number
}

type Listener = (state: MultiplayerState) => void

const EXPECTED_BUILD = 'orbitaloutpost-mp-v1'
const CONFIG_URL = '/multiplayer/bootstrap.json'

/** Small transport adapter: the UI is never allowed to fake an online match. */
export class MultiplayerClient {
  private socket: WebSocket | null = null
  private bootstrap: Bootstrap | null = null
  private listener: Listener
  private state: MultiplayerState = { status: 'idle', room: '', playerId: '', players: [], message: 'Ready to connect.' }

  constructor(listener: Listener) {
    this.listener = listener
  }

  get current(): MultiplayerState { return this.state }

  async connect(roomInput: string, nameInput: string): Promise<void> {
    this.disconnect(false)
    const room = cleanRoom(roomInput)
    const name = cleanName(nameInput)
    if (!room) return this.fail('Enter a room code first.')

    this.update({ status: 'loading', room, players: [], playerId: '', message: 'Loading multiplayer service…', error: undefined })
    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Configuration unavailable (${response.status})`)
      const config = await response.json() as Bootstrap
      if (config.build !== EXPECTED_BUILD || !config.signalingUrl.startsWith('wss://')) throw new Error('Incompatible multiplayer build.')
      this.bootstrap = config
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : 'Unable to load multiplayer service.')
    }

    await new Promise<void>(resolve => {
      this.update({ status: 'connecting', message: 'Connecting to room…', error: undefined })
      const url = new URL(this.bootstrap!.signalingUrl)
      url.searchParams.set('room', room)
      const socket = new WebSocket(url)
      this.socket = socket
      let settled = false
      const finish = () => { if (!settled) { settled = true; resolve() } }
      socket.onopen = () => {
        this.update({ status: 'connected', message: 'Connected — waiting for crew.' })
        this.send({ type: 'join', name })
        finish()
      }
      socket.onmessage = event => this.receive(event.data)
      socket.onerror = () => {
        this.update({ status: 'error', message: 'Connection failed.', error: 'Check the room code and try again.' })
        finish()
      }
      socket.onclose = event => {
        const wasConnected = this.state.status === 'connected'
        this.socket = null
        this.update({ status: wasConnected ? 'disconnected' : 'error', message: wasConnected ? 'Connection closed.' : 'Unable to join room.', error: event.reason || undefined })
        finish()
      }
    })
  }

  disconnect(notify = true): void {
    if (this.socket) {
      try { this.send({ type: 'leave' }) } catch { /* socket may already be gone */ }
      this.socket.close(1000, 'Leaving room')
      this.socket = null
    }
    if (notify || this.state.status !== 'idle') this.update({ status: 'idle', room: '', playerId: '', players: [], message: 'Ready to connect.', error: undefined })
  }

  sendAction(kind: string, target: string | null = null, revision = 0): void {
    this.send({ type: 'action', revision, action: { kind, target } })
  }

  private send(packet: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(packet))
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return
    let packet: Record<string, unknown>
    try { packet = JSON.parse(raw) as Record<string, unknown> } catch { return }
    const type = typeof packet.type === 'string' ? packet.type : ''
    if (type === 'welcome') {
      const id = typeof packet.playerId === 'string' ? packet.playerId : ''
      this.update({ playerId: id, players: [{ id, name: 'You', isSelf: true }], message: `${packet.roomSize ?? 1}/${packet.maxPlayers ?? this.bootstrap?.maxPlayers ?? 4} crew online.` })
      return
    }
    if (type === 'player_joined') {
      const id = typeof packet.playerId === 'string' ? packet.playerId : crypto.randomUUID()
      const name = typeof packet.name === 'string' ? packet.name : 'Crew member'
      const players = this.state.players.filter(player => player.id !== id)
      players.push({ id, name, joinedAt: Date.now() })
      this.update({ players, message: `${name} joined the crew.` })
      return
    }
    if (type === 'player_left') {
      const id = typeof packet.playerId === 'string' ? packet.playerId : ''
      this.update({ players: this.state.players.filter(player => player.id !== id), message: 'A crew member left the room.' })
      return
    }
    if (type === 'error') this.update({ status: 'error', message: 'Server rejected the packet.', error: typeof packet.reason === 'string' ? packet.reason : 'Unknown server error.' })
  }

  private fail(error: string): void { this.update({ status: 'error', message: 'Multiplayer unavailable.', error }) }

  private update(patch: Partial<MultiplayerState>): void {
    this.state = { ...this.state, ...patch }
    this.listener(this.state)
  }
}

export function cleanRoom(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) }
export function cleanName(value: string): string { return value.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Récupérateur' }
