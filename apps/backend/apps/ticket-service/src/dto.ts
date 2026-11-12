import { IsBoolean, IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToUndefined = () => Transform(({ value }) => (value === '' ? undefined : value));

// Vem de multipart/form-data: todos os campos chegam como texto.
export class CreateTicketDto {
  @trim() @IsString() @IsNotEmpty() @MaxLength(80) requesterName: string;
  @trim() @IsEmail({}, { message: 'Informe um e-mail válido.' }) email: string;
  @trim() @Matches(/^[\d\s()+-]{10,20}$/, { message: 'Informe um WhatsApp com DDD.' }) whatsapp: string;
  @emptyToUndefined() @IsOptional() @IsUUID() sectorId?: string;
  @trim() @emptyToUndefined() @IsOptional() @IsString() @MaxLength(40) equipmentTag?: string;
  @trim() @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @trim() @IsString() @IsNotEmpty() @MaxLength(4000) description: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsEnum(['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO', 'RESOLVIDO']) status?: 'ABERTO' | 'EM_ATENDIMENTO' | 'AGUARDANDO' | 'RESOLVIDO';
  @IsOptional() @IsEnum(['BAIXA', 'MEDIA', 'ALTA']) priority?: 'BAIXA' | 'MEDIA' | 'ALTA';
  /** "me" = assumir o chamado; null = devolver para a fila. */
  @IsOptional() @IsIn(['me', null]) assignee?: 'me' | null;
}

export class CreateEventDto {
  @trim() @IsString() @IsNotEmpty() @MaxLength(4000) message: string;
  @IsOptional() @IsBoolean() public?: boolean;
}
