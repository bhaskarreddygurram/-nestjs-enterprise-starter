import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleMailProvider } from './console-mail.provider';
import { MAIL_PROVIDER, MailProvider } from './mail.interface';
import { SmtpMailProvider } from './smtp-mail.provider';

/**
 * Shared mail transport, exported for any feature module (Auth password reset,
 * Notifications welcome) to consume via MAIL_PROVIDER.
 *
 * The concrete provider is chosen at runtime from `MAIL_TRANSPORT`:
 *   console (default) → logs emails to stdout (dev/CI)
 *   smtp              → real delivery via nodemailer (prod)
 */
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MailProvider =>
        config.get<string>('mail.transport') === 'smtp'
          ? new SmtpMailProvider(config)
          : new ConsoleMailProvider(config),
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
