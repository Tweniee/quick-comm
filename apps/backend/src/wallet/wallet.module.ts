import { Global, Module } from '@nestjs/common';
import { BusinessWalletController, PaymentsWebhookController } from './wallet.controller';
import { PaymentsService } from './payments.service';
import { WalletService } from './wallet.service';

@Global()
@Module({ controllers: [BusinessWalletController, PaymentsWebhookController], providers: [WalletService, PaymentsService], exports: [WalletService, PaymentsService] })
export class WalletModule {}
