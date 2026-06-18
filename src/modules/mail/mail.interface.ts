/** DI token for the active mail transport. */
export const MAIL_PROVIDER = 'MAIL_PROVIDER';

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Mail transport abstraction. Consumers depend only on this interface, so the
 * backend can be swapped (console → SMTP/SES/SendGrid) by binding a different
 * provider to MAIL_PROVIDER.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
