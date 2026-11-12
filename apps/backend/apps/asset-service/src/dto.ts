import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSectorDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsString() @IsNotEmpty() @MaxLength(50) type: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsUUID() parentId?: string | null;
}
export class UpdateSectorDto extends PartialType(CreateSectorDto) {}

export class CreateEquipmentDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsString() @IsNotEmpty() @MaxLength(50) type: string;
  @IsOptional() @IsString() @MaxLength(40) assetTag?: string | null;
  @IsOptional() @IsString() @MaxLength(60) serial?: string | null;
  @IsOptional() @IsEnum(['PROPRIO', 'ALUGADO']) ownership?: 'PROPRIO' | 'ALUGADO';
  @IsOptional() @IsUUID() sectorId?: string | null;
}
export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {}
