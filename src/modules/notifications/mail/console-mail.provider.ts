import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailMessage, MailProvider } from './mail.interface';

/**
 * Dev mail transport: "sends" by logging the message. No external dependency.
 * Swap for an SMTP/SES provider in production (bind it to MAIL_PROVIDER).
 */
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  constructor(private readonly config: ConfigService) {}

  send(message: MailMessage): Promise<void> {
    const from = this.config.get<string>(
      'mail.from',
      'no-reply@enterprise.local',
    );
    this.logger.log(
      `EMAIL from=${from} to=${message.to} subject="${message.subject}"`,
    );
    this.logger.debug(message.body);
    return Promise.resolve();
  }
}
