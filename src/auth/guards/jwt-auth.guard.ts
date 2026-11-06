import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UserSessionDto } from '../dto/index.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionCookie = request.cookies?.['forum_session'];

    if (!sessionCookie) {
      throw new UnauthorizedException('인증 세션 쿠키가 존재하지 않습니다.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<UserSessionDto>(sessionCookie);
      // Express Request 객체에 검증된 사용자 세션 바인딩
      (request as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('세션이 만료되었거나 유효하지 않은 토큰입니다.');
    }
  }
}
