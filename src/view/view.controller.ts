import { Controller, Get, Query, Render, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class ViewController {
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
  guide() {
    return {};
  }

  @Get()
  root(@Query('error') error: string | undefined, @Res() res: Response) {
    if (error === 'invalid_token') {
      return res.render('auth-error.html');
    }
    return res.redirect('/guide');
  }
}
