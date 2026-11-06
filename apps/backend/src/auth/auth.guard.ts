import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../common/errors';
import { Principal, PrincipalKind } from './auth.types';

const KINDS = 'qd:kinds';
const ROLES = 'qd:roles';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHENTICATED', 'Please log in', 401, 'LOGIN');
    let principal: Principal;
    try {
      principal = this.jwt.verify<Principal>(header.slice(7));
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Session expired, please log in again', 401, 'LOGIN');
    }
    const kinds = this.reflector.getAllAndOverride<PrincipalKind[]>(KINDS, [ctx.getHandler(), ctx.getClass()]);
    if (kinds?.length && !kinds.includes(principal.kind)) throw new AppError('FORBIDDEN', 'Not allowed for this account type', 403);
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && (!principal.role || !roles.includes(principal.role))) {
      throw new AppError('FORBIDDEN', 'Your role cannot do this', 403);
    }
    req.principal = principal;
    return true;
  }
}

/** @Auth('admin') or @Auth('admin', ['SUPER_ADMIN']) */
export function Auth(kinds: PrincipalKind | PrincipalKind[], roles?: string[]) {
  return applyDecorators(
    SetMetadata(KINDS, Array.isArray(kinds) ? kinds : [kinds]),
    SetMetadata(ROLES, roles ?? []),
    UseGuards(JwtAuthGuard),
  );
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest().principal;
});
