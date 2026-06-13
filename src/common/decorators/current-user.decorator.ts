import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserResponseDto } from '../../modules/users/dto/user-response.dto';

/**
 * Injects the authenticated user (as attached by JwtStrategy.validate).
 *
 *   getProfile(@CurrentUser() user: UserResponseDto) { ... }
 *   getId(@CurrentUser('id') id: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof UserResponseDto | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as UserResponseDto | undefined;
    return data && user ? user[data] : user;
  },
);
