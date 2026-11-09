import type { Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { ActivityChat } from '../application/ActivityChat.ts';
import type { ChatMessage } from '../domain/ActivityChat.ts';
import type { AuthUser } from '../../user/domain/User.ts';

type SocketState = { token: string | null; userId: string | null; subscriptions: Set<string> };
type Authenticate = (token: string) => Promise<AuthUser>;

export interface ChatRealtimePublisher { broadcast(message: ChatMessage): Promise<void> }

export class ActivityChatRealtime implements ChatRealtimePublisher {
  private readonly sockets = new Map<WebSocket, SocketState>();
  private wss: WebSocketServer | null = null;
  private authenticate: Authenticate | null = null;
  private chats: ActivityChat | null = null;
  private verificationTimer: NodeJS.Timeout | null = null;

  attach(server: Server, authenticate: Authenticate, chats: ActivityChat) {
    if (this.wss) throw new Error('El servidor WebSocket ya está configurado.');
    this.authenticate = authenticate;
    this.chats = chats;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
    server.on('upgrade', (request, socket, head) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (path !== '/ws') { socket.destroy(); return; }
      this.wss?.handleUpgrade(request, socket, head, ws => this.connect(ws));
    });
    this.verificationTimer = setInterval(() => { void this.verifySessions(); }, 30_000);
    this.verificationTimer.unref();
  }

  private connect(ws: WebSocket) {
    const state: SocketState = { token: null, userId: null, subscriptions: new Set() };
    this.sockets.set(ws, state);
    const timeout = setTimeout(() => { if (!state.userId) ws.close(4001, 'Autenticación requerida'); }, 5000);
    ws.on('message', (data, isBinary) => { if (!isBinary) void this.receive(ws, state, data); });
    ws.on('close', () => { clearTimeout(timeout); this.sockets.delete(ws); });
    ws.on('error', () => { this.sockets.delete(ws); });
    this.send(ws, { type: 'connected' });
  }

  private async receive(ws: WebSocket, state: SocketState, data: RawData) {
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(data.toString());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      input = parsed as Record<string, unknown>;
    } catch { this.send(ws, { type: 'error', message: 'Mensaje WebSocket inválido.' }); return; }
    if (input.type === 'authenticate') {
      if (typeof input.token !== 'string' || !input.token || !this.authenticate) { ws.close(4001, 'Token inválido'); return; }
      try {
        const user = await this.authenticate(input.token);
        if (user.role !== 'user') { ws.close(4003, 'Acceso denegado'); return; }
        state.token = input.token; state.userId = user.id;
        this.send(ws, { type: 'authenticated' });
      } catch { ws.close(4001, 'Sesión inválida'); }
      return;
    }
    if (input.type === 'subscribe') {
      if (!state.userId || typeof input.activityId !== 'string' || !this.chats) { ws.close(4001, 'Autenticación requerida'); return; }
      try {
        await this.chats.info(input.activityId, state.userId);
        state.subscriptions.add(input.activityId);
        this.send(ws, { type: 'subscribed', activityId: input.activityId });
      } catch { this.send(ws, { type: 'error', message: 'No tienes acceso al chat solicitado.' }); }
      return;
    }
    this.send(ws, { type: 'error', message: 'Operación WebSocket no reconocida.' });
  }

  async broadcast(message: ChatMessage) {
    if (!this.chats) return;
    const members = new Set(await this.chats.activeMemberIds(message.activityId));
    const payload = JSON.stringify({ type: 'message', activityId: message.activityId, message });
    for (const [socket, state] of this.sockets) {
      if (socket.readyState === WebSocket.OPEN && state.userId && members.has(state.userId) && state.subscriptions.has(message.activityId)) {
        socket.send(payload);
      }
    }
  }

  private async verifySessions() {
    if (!this.authenticate) return;
    await Promise.all([...this.sockets].map(async ([socket, state]) => {
      if (!state.token) return;
      try {
        const user = await this.authenticate!(state.token);
        if (user.role !== 'user' || user.id !== state.userId) socket.close(4003, 'Acceso revocado');
      } catch { socket.close(4001, 'Sesión vencida'); }
    }));
  }

  private send(ws: WebSocket, value: Record<string, unknown>) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  }

  close() {
    if (this.verificationTimer) clearInterval(this.verificationTimer);
    for (const socket of this.sockets.keys()) socket.close(1001, 'Servidor detenido');
    this.wss?.close();
  }
}
