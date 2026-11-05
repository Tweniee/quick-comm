import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface OutboundMessage {
  channel: 'SMS' | 'WHATSAPP' | 'PUSH' | 'EMAIL';
  to: string;
  template: string;
  body: string;
  /** Secret (OTP) inside the body. It is masked before the body is logged. */
  secret?: string;
  orderId?: string;
}

/** Provider interface. Plug MSG91 / Gupshup / Twilio / WhatsApp Cloud API here. */
export interface MessageProvider {
  send(msg: OutboundMessage): Promise<void>;
}

class ConsoleProvider implements MessageProvider {
  private log = new Logger('Notify');
  async send(msg: OutboundMessage) {
    if (process.env.NODE_ENV !== 'test') this.log.log(`[${msg.channel}] → ${msg.to}: ${msg.body}`);
  }
}

@Injectable()
export class NotificationsService {
  private provider: MessageProvider = new ConsoleProvider();
  constructor(private prisma: PrismaService) {}

  setProvider(p: MessageProvider) {
    this.provider = p;
  }

  async send(msg: OutboundMessage): Promise<boolean> {
    const logged = msg.secret ? msg.body.split(msg.secret).join('X'.repeat(msg.secret.length)) : msg.body;
    try {
      await this.provider.send(msg);
      await this.prisma.notificationLog.create({ data: { channel: msg.channel, to: msg.to, template: msg.template, body: logged, orderId: msg.orderId } });
      return true;
    } catch (e) {
      await this.prisma.notificationLog.create({
        data: { channel: msg.channel, to: msg.to, template: msg.template, body: logged, orderId: msg.orderId, status: 'FAILED', error: String(e) },
      });
      return false;
    }
  }

  /** SMS with WhatsApp fallback/duplicate (masterplan A3: OTP by SMS and WhatsApp). */
  async sendSmsAndWhatsapp(msg: Omit<OutboundMessage, 'channel'>): Promise<boolean> {
    const [a, b] = await Promise.all([this.send({ ...msg, channel: 'SMS' }), this.send({ ...msg, channel: 'WHATSAPP' })]);
    return a || b;
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
