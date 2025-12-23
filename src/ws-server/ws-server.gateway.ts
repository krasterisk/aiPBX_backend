import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway(3033, {
  cors: {
    origin: '*',
  },
})
export class WsServerGateway {
  private readonly logger = new Logger(WsServerGateway.name);
  @WebSocketServer() server: Server;
  public port: number = 3033;

  // userId → socket.id[]
  private userSockets: Map<number, Set<string>> = new Map();

  afterInit() {
    this.logger.log('WS server started on port:', this.port);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Удаляем сокет из всех userId, к которым он привязан
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.delete(client.id) && sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  @SubscribeMessage('auth')
  handleAuth(@MessageBody() userId: number, @ConnectedSocket() client: Socket) {
    if (!userId) return;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    this.logger.log(`Client ${client.id} authenticated as user ${userId}`);
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() channelId: string, @ConnectedSocket() client: Socket) {
    client.join(channelId);
    this.logger.log(`Client ${client.id} joined room: ${channelId}`);
  }

  @SubscribeMessage('leave')
  handleLeave(@MessageBody() channelId: string, @ConnectedSocket() client: Socket) {
    client.leave(channelId);
    this.logger.log(`Client ${client.id} left room: ${channelId}`);
  }

  // Отправка событий только конкретному пользователю
  sendToClient(channelId: string, callerId: string, assistant: string, userId: number | null, event: any) {
    const fullEvent = {
      channelId,
      callerId,
      assistant,
      userId,
      ...event,
    };

    if (!userId) {
      // если userId нет, можно отправить всем (или проигнорировать)
      this.server.emit('openai.event', fullEvent);
      return;
    }

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit('openai.event', fullEvent);
      }
    }
  }
}
