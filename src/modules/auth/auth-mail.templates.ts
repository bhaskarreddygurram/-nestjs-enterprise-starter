import { RenderedMessage } from '../notifications/templates';

/** Auth-related email templates (password reset). */
export const authMailTemplates = {
  passwordReset(resetUrl: string, ttlMinutes: number): RenderedMessage {
    return {
      subject: 'Reset your password',
      body:
        `We received a request to reset your password.\n\n` +
        `Use the link below to choose a new one — it expires in ${ttlMinutes} minutes:\n\n` +
        `${resetUrl}\n\n` +
        `If you didn't request this, you can safely ignore this email; ` +
        `your password will not change.\n\n` +
        `— The Team`,
    };
  },
};
