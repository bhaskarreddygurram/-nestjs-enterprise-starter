import { Module } from '@nestjs/common';
import { ConsoleMailProvider } from './console-mail.provider';
import { MAIL_PROVIDER } from './mail.interface';

/**
 * Shared mail transport. Binds MAIL_PROVIDER to the console provider in dev
 * (swap for SMTP/SES in prod) and exports it so any feature module — Auth
 * (password reset), Notifications (welcome) — can send mail without owning a
 * transport of its own.
 */
@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: ConsoleMailProvider }],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
