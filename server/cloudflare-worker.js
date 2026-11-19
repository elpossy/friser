import { DurableObject } from 'cloudflare:workers'

const PROTOCOL = 'orbitaloutpost-mp-v1'
const MAX_MESSAGE_BYTES = 16 * 1024
const MAX_PLAYERS = 4

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'orbitaloutpost-mp', protocol: PROTOCOL })
    }
    if (url.pathname !== '/ws') return new Response('ORBITAL OUTPOST multiplayer service')
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const room = (url.searchParams.get('room') || 'lobby').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
    if (!room) return new Response('Invalid room', { status: 400 })
    return env.ROOMS.getByName(room).fetch(request)
  },
}

export class OrbitalRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) {
      server.close(1013, 'Room full')
      return new Response(null, { status: 101, webSocket: client })
    }
    const playerId = crypto.randomUUID()
    this.ctx.acceptWebSocket(server, ['player:' + playerId])
    server.serializeAttachment({ playerId, joinedAt: Date.now() })
    server.send(JSON.stringify({ type: 'welcome', protocol: PROTOCOL, playerId, roomSize: this.ctx.getWebSockets().length, maxPlayers: MAX_PLAYERS, serverTime: Date.now() }))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return this.reject(ws, 'message_too_large')
    let packet
    try { packet = JSON.parse(message) } catch { return this.reject(ws, 'invalid_json') }
    if (!packet || typeof packet.type !== 'string') return this.reject(ws, 'invalid_packet')
    const attachment = ws.deserializeAttachment() || {}
    if (packet.type === 'join') {
      const name = typeof packet.name === 'string' ? packet.name.trim().slice(0, 24) : 'Récupérateur'
      ws.serializeAttachment({ ...attachment, name })
      return this.broadcast({ type: 'player_joined', playerId: attachment.playerId, name, roomSize: this.ctx.getWebSockets().length }, ws)
    }
    if (packet.type === 'action') {
      if (!Number.isInteger(packet.revision) || packet.revision < 0 || packet.revision > 1000000) return this.reject(ws, 'invalid_revision')
      if (!packet.action || typeof packet.action !== 'object' || typeof packet.action.kind !== 'string') return this.reject(ws, 'invalid_action')
      return this.broadcast({ type: 'action', revision: packet.revision, playerId: attachment.playerId, action: { kind: packet.action.kind.slice(0, 32), target: packet.action.target ?? null }, serverTime: Date.now() }, ws)
    }
    if (packet.type === 'pose') {
      const p = packet.position
      if (!p || ![p.x, p.y, p.z].every(Number.isFinite) || Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000 || Math.abs(p.z) > 1000) return this.reject(ws, 'invalid_pose')
      return this.broadcast({ type: 'pose', playerId: attachment.playerId, position: { x: Number(p.x), y: Number(p.y), z: Number(p.z) }, sequence: Number.isInteger(packet.sequence) ? packet.sequence : 0, serverTime: Date.now() }, ws)
    }
    if (packet.type === 'leave') return ws.close(1000, 'Leaving')
    return this.reject(ws, 'unsupported_packet')
  }

  async webSocketClose(ws) {
    const attachment = ws.deserializeAttachment() || {}
    this.broadcast({ type: 'player_left', playerId: attachment.playerId || null, roomSize: Math.max(0, this.ctx.getWebSockets().length - 1) }, ws)
  }

  async webSocketError(ws) { try { ws.close(1011, 'Socket error') } catch {} }

  broadcast(packet, except) {
    const encoded = JSON.stringify(packet)
    for (const socket of this.ctx.getWebSockets()) if (socket !== except && socket.readyState === WebSocket.OPEN) socket.send(encoded)
  }

  reject(ws, reason) { try { ws.send(JSON.stringify({ type: 'error', reason })) } catch {} }
}
