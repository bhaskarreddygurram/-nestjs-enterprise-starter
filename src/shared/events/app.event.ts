/** Domain events (distinct from the audit channel) that other modules react to. */
export const AppEvent = {
  USER_REGISTERED: 'user.registered',
} as const;

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  name?: string | null;
}
