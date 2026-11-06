import { Controller, Get, Query, Render, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { UserSessionDto } from '../auth/dto/index.js';

@Controller()
export class ViewController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  @Get('login')
  @Render('login.html')
  login(
    @Query('token') token?: string,
    @Query('redirect') redirect = 'main',
  ) {
    return {
      token: token ?? '',
      redirect,
    };
  }

  @Get('guide')
  @Render('guide.html')
  async guide(@Req() req: Request) {
    const sessionCookie = req.cookies?.['forum_session'];
    let userStatus = 'newbie'; // 온보딩 서약 인풋창과 버튼이 활성화되는 기본 상태

    if (sessionCookie) {
      try {
        const payload = await this.jwtService.verifyAsync<UserSessionDto>(sessionCookie);
        const isCompleted = await this.authService.isGuideCompleted(payload.discordId);
        userStatus = isCompleted ? 'member' : 'newbie';
      } catch {
        userStatus = 'newbie';
      }
    }

    return {
      user_status: userStatus,
      discord_invite_url: '#',
    };
  }

  @Get()
  root(@Query('error') error: string | undefined, @Res() res: Response) {
    if (error === 'invalid_token') {
      return res.render('auth-error.html');
    }
    return res.redirect('/guide');
  }
}
