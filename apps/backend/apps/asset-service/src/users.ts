import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() password: string;
}

class CreateUserDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(['TECNICO', 'RESPONSAVEL']) role: 'TECNICO' | 'RESPONSAVEL';
  @IsOptional() @IsUUID() sectorId?: string;
}

const publicFields = { id: true, name: true, email: true, role: true, sectorId: true };

// /auth/verify é interno: o gateway não expõe essa rota, só a chama no login.
@Controller()
export class UsersController {
  @Post('auth/verify') @HttpCode(200)
  async verify(@Body() dto: LoginDto) {
    const user = await db.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !checkPassword(dto.password, user.passwordHash)) throw new UnauthorizedException('E-mail ou senha inválidos.');
    return { id: user.id, name: user.name, email: user.email, role: user.role, sectorId: user.sectorId };
  }

  @Get('users')
  list() {
    return db.user.findMany({ select: publicFields, orderBy: { name: 'asc' } });
  }

  @Post('users')
  create(@Body() { password, ...dto }: CreateUserDto) {
    return db.user.create({ data: { ...dto, email: dto.email.toLowerCase(), passwordHash: hashPassword(password) }, select: publicFields });
  }
}
