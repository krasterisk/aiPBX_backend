import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer, WsResponse
} from '@nestjs/websockets';
import {Logger} from "@nestjs/common";
import {Server, Socket} from "socket.io";

@WebSocketGateway(3033,{
  cors: {
    origin: '*',
  },
})
export class WsServerGateway {
  private readonly logger = new Logger(WebSocketGateway.name);
  @WebSocketServer() server: Server;
  public port: number = 3033;

  afterInit() {
    this.logger.log('WebSocket сервер инициализирован');
    console.log('ws server started on port: ', this.port)
  }

  handleConnection(client: any) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() channelId: string, @ConnectedSocket() client: Socket) {
    client.join(channelId);
    console.log(`Client ${client.id} joined room: ${channelId}`);
  }

  @SubscribeMessage('leave')
  handleLeave(@MessageBody() channelId: string, @ConnectedSocket() client: Socket) {
    client.leave(channelId);
    console.log(`Client ${client.id} left room: ${channelId}`);
  }

  sendToClient(channelId: string, callerId: string, event: any) {
    const fullEvent = {
      channelId,
      callerId,
      ...event,
    };
    this.server.emit('openai.event', fullEvent);
  }
}
