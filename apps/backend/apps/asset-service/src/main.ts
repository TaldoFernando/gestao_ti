import {
  ArgumentsHost, BadRequestException, Body, Catch, ConflictException, Controller, Delete, ExceptionFilter,
  Get, Headers, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, ValidationPipe,
} from '@nestjs/common';
import { BaseExceptionFilter, NestFactory } from '@nestjs/core';
import { HealthController } from '@app/common';
import { Prisma } from '.prisma/asset';
import { db } from './db';
import { UsersController } from './users';
import { CreateEquipmentDto, CreateSectorDto, UpdateEquipmentDto, UpdateSectorDto } from './dto';
import { seed } from './seed';

// Converte erros de constraint do Postgres em respostas HTTP; a regra de negócio vive no schema.
@Catch(Prisma.PrismaClientKnownRequestError)
class PrismaErrorFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const map: Record<string, Error> = {
      P2002: new ConflictException('Registro duplicado (patrimônio ou e-mail já cadastrado).'),
      P2003: new ConflictException('Remova ou transfira os locais vinculados antes de excluir este setor.'),
      P2025: new NotFoundException('Registro não encontrado.'),
    };
    super.catch(map[e.code] ?? e, host);
  }
}

@Controller('sectors')
class SectorsController {
  @Get()
  list() {
    return db.sector.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { equipment: true } } } });
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return (await db.sector.findUnique({ where: { id }, include: { children: true } })) ?? notFound();
  }

  @Post()
  async create(@Body() dto: CreateSectorDto) {
    await assertParentIsRoot(dto.parentId);
    return db.sector.create({ data: dto });
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectorDto) {
    if (dto.parentId === id) throw new BadRequestException('Um setor não pode ser vinculado a ele mesmo.');
    await assertParentIsRoot(dto.parentId);
    if (dto.parentId && (await db.sector.count({ where: { parentId: id } })))
      throw new BadRequestException('Um setor principal com locais vinculados não pode virar local de outro.');
    return db.sector.update({ where: { id }, data: dto });
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await db.sector.delete({ where: { id } });
  }
}

type Hdrs = Record<string, string | undefined>;
const byName = (h: Hdrs) => decodeURIComponent(h['x-user-name'] ?? 'Sistema');

/**
 * Setores que o usuário pode ver. null = todos (técnico).
 * Responsável vê o próprio setor e, se for principal, os locais vinculados. Sem setor, não vê nada.
 */
async function scope(h: Hdrs): Promise<string[] | null> {
  if (h['x-user-role'] !== 'RESPONSAVEL') return null;
  const own = h['x-user-sector'];
  if (!own) return [];
  const children = await db.sector.findMany({ where: { parentId: own }, select: { id: true } });
  return [own, ...children.map((c) => c.id)];
}

async function assertVisible(h: Hdrs, equipmentId: string) {
  const ids = await scope(h);
  const e = await db.equipment.findUnique({ where: { id: equipmentId } });
  if (!e || (ids && !ids.includes(e.sectorId ?? ''))) notFound();
  return e;
}

const sectorLabel = async (id: string | null | undefined) => {
  if (!id) return null;
  const s = await db.sector.findUnique({ where: { id }, include: { parent: true } });
  return s ? (s.parent ? `${s.parent.name} › ${s.name}` : s.name) : null;
};

@Controller('equipment')
class EquipmentController {
  // sectorId inclui os locais vinculados, como o filtro do protótipo.
  @Get()
  async list(@Headers() h: Hdrs, @Query('sectorId') sectorId?: string, @Query('type') type?: string, @Query('q') q?: string) {
    const where: Prisma.EquipmentWhereInput = {};
    const and: Prisma.EquipmentWhereInput[] = [];
    const ids = await scope(h);
    if (ids) and.push({ sectorId: { in: ids } });
    if (sectorId === 'none') where.sectorId = null;
    else if (sectorId) and.push({ OR: [{ sectorId }, { sector: { parentId: sectorId } }] });
    if (type) where.type = type;
    if (q) {
      const like = { contains: q, mode: 'insensitive' as const };
      and.push({ OR: [{ name: like }, { type: like }, { assetTag: like }, { serial: like }, { sector: { name: like } }] });
    }
    where.AND = and;
    return db.equipment.findMany({ where, orderBy: { name: 'asc' }, include: { sector: { include: { parent: true } } } });
  }

  // Usado pelo ticket-service para conferir o patrimônio do chamado. Devolve o mínimo: id e patrimônio.
  // Maiúsculas/minúsculas não importam (o cidadão digita "pat-00201").
  @Get('by-tag/:tag')
  async byTag(@Param('tag') tag: string, @Headers() h: Hdrs) {
    const e = await db.equipment.findFirst({ where: { assetTag: { equals: tag.trim(), mode: 'insensitive' } }, select: { id: true, assetTag: true } });
    if (!e) notFound();
    await assertVisible(h, e.id);
    return e;
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Headers() h: Hdrs) {
    await assertVisible(h, id);
    return db.equipment.findUnique({ where: { id }, include: { sector: true } });
  }

  @Get(':id/movements')
  async movements(@Param('id', ParseUUIDPipe) id: string, @Headers() h: Hdrs) {
    await assertVisible(h, id);
    return db.movement.findMany({ where: { equipmentId: id }, orderBy: { at: 'desc' } });
  }

  @Post()
  async create(@Body() dto: CreateEquipmentDto, @Headers() h: Hdrs) {
    const toName = await sectorLabel(dto.sectorId);
    return db.equipment.create({
      data: { ...dto, assetTag: dto.assetTag || null, movements: { create: { fromName: null, toName, byName: byName(h) } } },
    });
  }

  // Mudou de local → registra a movimentação na mesma transação.
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEquipmentDto, @Headers() h: Hdrs) {
    const current = await db.equipment.findUnique({ where: { id } });
    if (!current) notFound();
    const data = dto.assetTag === '' ? { ...dto, assetTag: null } : dto;
    const moved = dto.sectorId !== undefined && (dto.sectorId ?? null) !== current.sectorId;
    if (!moved) return db.equipment.update({ where: { id }, data });
    const [fromName, toName] = await Promise.all([sectorLabel(current.sectorId), sectorLabel(dto.sectorId)]);
    return db.equipment.update({ where: { id }, data: { ...data, movements: { create: { fromName, toName, byName: byName(h) } } } });
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await db.equipment.delete({ where: { id } });
  }
}

function notFound(): never {
  throw new NotFoundException('Registro não encontrado.');
}

// Hierarquia de dois níveis, como no protótipo: só setores principais podem ter locais.
async function assertParentIsRoot(parentId?: string | null) {
  if (!parentId) return;
  const parent = await db.sector.findUnique({ where: { id: parentId } });
  if (!parent) throw new BadRequestException('Setor principal não encontrado.');
  if (parent.parentId) throw new BadRequestException('Locais só podem ser vinculados a um setor principal.');
}

@Module({ controllers: [HealthController, SectorsController, EquipmentController, UsersController] })
export class AppModule {}

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new PrismaErrorFilter(app.getHttpAdapter()));
  return app;
}

async function bootstrap() {
  await seed(db);
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3000);
}
if (require.main === module) bootstrap();
