import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SmtpMailProvider } from './smtp-mail.provider';

jest.mock('nodemailer');

const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

const config = {
  get: jest.fn((key: string, def?: unknown) => {
    const values: Record<string, unknown> = {
      'mail.from': 'no-reply@test.local',
      'mail.host': 'smtp.test.local',
      'mail.port': 587,
      'mail.secure': false,
      'mail.user': 'user',
      'mail.password': 'pass',
    };
    return values[key] ?? def;
  }),
} as unknown as ConfigService;

describe('SmtpMailProvider', () => {
  beforeEach(() => sendMail.mockClear());

  it('builds the transporter from config (host/port/auth)', () => {
    new SmtpMailProvider(config);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.test.local',
        port: 587,
        secure: false,
        auth: { user: 'user', pass: 'pass' },
      }),
    );
  });

  it('sends mail with the configured from address', async () => {
    const provider = new SmtpMailProvider(config);
    await provider.send({
      to: 'jane@example.com',
      subject: 'Hi',
      body: 'Body',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@test.local',
      to: 'jane@example.com',
      subject: 'Hi',
      text: 'Body',
    });
  });
});
