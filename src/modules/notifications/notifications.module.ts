import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * Notifications: in-app + email. The mail transport comes from the shared
 * MailModule (console in dev → swap for SMTP in prod). Reacts to domain events
 * via the listener, keeping producers (Auth) decoupled.
 */
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationsListener,
  ],
})
export class NotificationsModule {}
