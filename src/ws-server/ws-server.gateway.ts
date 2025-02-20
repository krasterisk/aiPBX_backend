import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer, WsResponse
} from '@nestjs/websockets';
import {Logger} from "@nestjs/common";
import {Server} from "socket.io";
import {from, map, Observable} from "rxjs";

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

  @SubscribeMessage('events')
  findAll(@MessageBody() data: any): Observable<WsResponse<number>> {
    console.log('receive event events')
    return from([1, 2, 3]).pipe(map(item => ({ event: 'events', data: item })));
  }

  @SubscribeMessage('identity')
  async identity(@MessageBody() data: number): Promise<number> {
    console.log('receive event identity')
    console.log(`Received message from client ${data}`)
    return data;
  }

  @SubscribeMessage('message')
  handleMessage(client: any, payload: any) {
    this.logger.log(`Received message from client ${client.id}: ${payload}`);
    console.log('receive event message')
    console.log(`Received message from client ${client.id}: ${JSON.stringify(payload)}`)
    return {
      event: 'message',
      data: payload,
      timestamp: new Date().toISOString()
    };
  }
}
