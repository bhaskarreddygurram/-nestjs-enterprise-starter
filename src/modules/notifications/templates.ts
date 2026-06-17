/**
 * Minimal in-code email/notification templates. Kept simple (string builders)
 * — a DB-backed template store with a rendering engine is a future extension.
 */
export interface RenderedMessage {
  subject: string;
  body: string;
}

export const templates = {
  welcome(name: string): RenderedMessage {
    return {
      subject: 'Welcome to the platform',
      body:
        `Hi ${name},\n\n` +
        `Your account has been created successfully. ` +
        `You can now sign in and start using the platform.\n\n` +
        `— The Team`,
    };
  },
};
