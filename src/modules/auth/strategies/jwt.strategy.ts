import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RbacService } from '../../rbac/rbac.service';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../authenticated-user.interface';
import { JwtPayload } from '../jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret', ''),
    });
  }

  /**
   * Runs after the signature + expiry are verified. We re-load the user (so a
   * deactivated/deleted account cannot reuse a still-valid token) and resolve
   * their current roles/permissions. The return value becomes `request.user`.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findEntityById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }

    const { roles, permissions } = await this.rbacService.getUserAuthorization(
      user.id,
    );

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      roles,
      permissions,
    };
  }
}
