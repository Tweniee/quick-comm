import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Principal } from '../auth/auth.types';

/**
 * Realtime push (Socket.IO). Clients must still work by polling when the socket drops (masterplan §10).
 * Rooms: driver:<id>, business:<id>, admin, track:<token>
 */
@WebSocketGateway({ cors: { origin: true }, path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection {
  private log = new Logger('Realtime');
  @WebSocketServer() server: Server;

  constructor(private jwt: JwtService) {}

  handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
    const trackToken = client.handshake.query?.track as string | undefined;
    if (trackToken) {
      client.join(`track:${trackToken}`);
      return;
    }
    try {
      const p = this.jwt.verify<Principal>(token);
      if (p.kind === 'driver') client.join(`driver:${p.sub}`);
      if (p.kind === 'business' && p.businessId) client.join(`business:${p.businessId}`);
      if (p.kind === 'admin') client.join('admin');
    } catch {
      client.disconnect(true);
    }
  }

  emit(room: string, event: string, data: unknown) {
    try {
      this.server?.to(room).emit(event, data);
    } catch (e) {
      this.log.warn(`emit failed: ${e}`);
    }
  }
}
