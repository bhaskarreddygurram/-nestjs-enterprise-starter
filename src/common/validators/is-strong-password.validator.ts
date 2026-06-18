import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Centralised password policy, applied wherever a user sets a password
 * (register, reset, change). Keeping it in one decorator means the rules can
 * never drift between endpoints.
 *
 * Policy: 8–128 chars, with at least one lowercase, one uppercase, one digit
 * and one special character.
 */
export const PASSWORD_POLICY_DESCRIPTION =
  'Min 8 chars, with at least one uppercase, one lowercase, one digit and one special character';

export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(8),
    MaxLength(128),
    Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
      message:
        'password must contain at least one uppercase letter, one lowercase letter, one digit and one special character',
    }),
  );
}
