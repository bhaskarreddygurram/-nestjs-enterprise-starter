import { Module } from '@nestjs/common';
import { ConsoleMailProvider } from './mail/console-mail.provider';
import { MAIL_PROVIDER } from './mail/mail.interface';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * Notifications: in-app + email. The mail transport is bound via MAIL_PROVIDER
 * (console in dev → swap for SMTP in prod). Reacts to domain events via the
 * listener, keeping producers (Auth) decoupled.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationsListener,
    { provide: MAIL_PROVIDER, useClass: ConsoleMailProvider },
  ],
})
export class NotificationsModule {}
