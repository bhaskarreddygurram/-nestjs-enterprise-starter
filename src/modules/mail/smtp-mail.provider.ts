import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { MailMessage, MailProvider } from './mail.interface';

/**
 * Real SMTP transport (nodemailer). Activated by `MAIL_TRANSPORT=smtp` and the
 * MAIL_HOST/PORT/SECURE/USER/PASSWORD settings. Works with any SMTP provider
 * (Gmail, SendGrid, Mailgun, Postmark, Brevo, Amazon SES, …).
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.get<string>('mail.from', 'no-reply@enterprise.local');
    const user = config.get<string>('mail.user');
    const pass = config.get<string>('mail.password');

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('mail.host'),
      port: config.get<number>('mail.port', 587),
      secure: config.get<boolean>('mail.secure', false), // true for port 465
      auth: user ? { user, pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    this.logger.log(`EMAIL sent to=${message.to} subject="${message.subject}"`);
  }
}
