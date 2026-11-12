import {
  ArgumentsHost, BadRequestException, Body, Catch, Controller, ExceptionFilter, Get, Headers, Module, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFiles, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import { BaseExceptionFilter, NestFactory } from '@nestjs/core';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MulterError, diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { HealthController } from '@app/common';
import { Prisma, PrismaClient } from '.prisma/ticket';
import { withUniqueProtocol } from './protocol';
import { CreateEventDto, CreateTicketDto, UpdateTicketDto } from './dto';
import { enqueue, startOutboxPublisher } from './outbox';

const notifyFields = (t: { protocol: string; title: string; email: string; requesterName: string }) => ({
  protocol: t.protocol, title: t.title, email: t.email, requesterName: t.requesterName,
});

const db = new PrismaClient();
const ASSET = process.env.ASSET_SERVICE_URL ?? 'http://localhost:3002';
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif)|application\/pdf|video\/(mp4|webm|quicktime))$/;
const upload = FilesInterceptor('files', 5, {
  storage: diskStorage({ destination: UPLOAD_DIR, filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()) }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_MIME.test(file.mimetype) ? cb(null, true) : cb(new BadRequestException('Envie fotos, PDF ou vídeo (MP4/WebM/MOV).'), false),
});

const STATUS_LABEL = { ABERTO: 'Aberto', EM_ATENDIMENTO: 'Em atendimento', AGUARDANDO: 'Aguardando retorno', RESOLVIDO: 'Resolvido' };

type Me = { id: string; name: string };
const me = (h: Record<string, string>): Me => ({ id: h['x-user-id'], name: decodeURIComponent(h['x-user-name'] ?? 'Técnico') });

// O nome do setor é copiado do asset-service. Se o inventário estiver fora, o chamado abre mesmo assim (ADR 01).
async function sectorName(sectorId?: string) {
  if (!sectorId) return null;
  try {
    const res = await fetch(`${ASSET}/api/sectors/${sectorId}`, { signal: AbortSignal.timeout(2000) });
    if (res.status === 404) throw new BadRequestException('Setor não encontrado.');
    return res.ok ? ((await res.json()) as { name: string }).name : null;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    return null;
  }
}

@Catch(MulterError)
class UploadErrorFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(e: MulterError, host: ArgumentsHost) {
    const msg = e.code === 'LIMIT_FILE_SIZE' ? 'Cada arquivo pode ter no máximo 20 MB.' : 'Envie no máximo 5 arquivos.';
    super.catch(new BadRequestException(msg), host);
  }
}

@Controller('tickets')
class TicketsController {
  // Público (gateway): cidadão abre chamado sem login.
  @Post()
  @UseInterceptors(upload)
  async create(@Body() dto: CreateTicketDto, @UploadedFiles() files: Express.Multer.File[] = []) {
    const name = await sectorName(dto.sectorId);
    // Protocolo repetido (~1 em 10^12) → P2002 → nova transação com outro protocolo (ADR 0006).
    const ticket = await withUniqueProtocol((protocol) => db.$transaction(async (tx) => {
      const t = await tx.ticket.create({
        data: {
          ...dto,
          protocol,
          sectorName: name,
          events: { create: { type: 'ABERTURA', message: 'Chamado aberto.' } },
          attachments: { create: files.map((f) => ({ filename: f.originalname, path: f.filename, mime: f.mimetype, size: f.size })) },
        },
      });
      await enqueue(tx, { type: 'ticket.created', ...notifyFields(t) });
      return t;
    }));
    return { protocol: ticket.protocol };
  }

  // Público: só o que o cidadão precisa ver; nada de e-mail, telefone ou notas internas.
  @Get('protocol/:protocol')
  async byProtocol(@Param('protocol') protocol: string) {
    const t = await db.ticket.findUnique({
      where: { protocol: protocol.toUpperCase() },
      select: {
        protocol: true, title: true, status: true, sectorName: true, createdAt: true, updatedAt: true,
        events: { where: { public: true }, orderBy: { createdAt: 'asc' }, select: { type: true, message: true, createdAt: true } },
      },
    });
    if (!t) throw new NotFoundException('Protocolo não encontrado. Confira as letras e números.');
    return t;
  }

  // Paginado por offset; o total vai no cabeçalho X-Total-Count para a resposta continuar sendo uma lista.
  @Get()
  async list(
    @Res({ passthrough: true }) res: Response,
    @Headers() h: Record<string, string>,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('mine') mine?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') sizeParam?: string,
  ) {
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(10, Math.max(1, Number(sizeParam) || 10)); // máximo 10 por página
    const where: Prisma.TicketWhereInput = {};
    if (status) where.status = status as never;
    if (mine) where.assigneeId = me(h).id;
    if (q) {
      const like = { contains: q, mode: 'insensitive' as const };
      where.OR = [{ protocol: like }, { title: like }, { requesterName: like }, { sectorName: like }, { equipmentTag: like }];
    }
    // Fila: prioridade alta primeiro, depois os mais antigos.
    const [total, items] = await db.$transaction([
      db.ticket.count({ where }),
      db.ticket.findMany({
        where,
        // id desempata: sem ele, itens com mesma data podem pular ou repetir entre páginas.
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, protocol: true, title: true, status: true, priority: true, requesterName: true, sectorName: true, assigneeName: true, createdAt: true },
      }),
    ]);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const t = await db.ticket.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } }, attachments: { select: { id: true, filename: true, mime: true, size: true } } },
    });
    if (!t) throw new NotFoundException('Chamado não encontrado.');
    return t;
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto, @Headers() h: Record<string, string>) {
    const user = me(h);
    const current = await db.ticket.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Chamado não encontrado.');

    const data: Prisma.TicketUpdateInput = {};
    const events: Prisma.TicketEventCreateWithoutTicketInput[] = [];
    if (dto.status && dto.status !== current.status) {
      data.status = dto.status;
      events.push({ type: 'STATUS', message: `Status alterado para “${STATUS_LABEL[dto.status]}”.`, authorName: user.name });
    }
    if (dto.priority) data.priority = dto.priority;
    if (dto.assignee === 'me') {
      Object.assign(data, { assigneeId: user.id, assigneeName: user.name });
      events.push({ type: 'NOTA', public: false, message: `${user.name} assumiu o chamado.`, authorName: user.name });
      // Assumir um chamado aberto já coloca em atendimento.
      if (current.status === 'ABERTO' && !dto.status) {
        data.status = 'EM_ATENDIMENTO';
        events.push({ type: 'STATUS', message: 'Status alterado para “Em atendimento”.', authorName: user.name });
      }
    } else if (dto.assignee === null) {
      Object.assign(data, { assigneeId: null, assigneeName: null });
    }
    return db.$transaction(async (tx) => {
      const t = await tx.ticket.update({ where: { id }, data: { ...data, events: { create: events } } });
      if (t.status !== current.status) await enqueue(tx, { type: 'ticket.status_changed', ...notifyFields(t), status: STATUS_LABEL[t.status] });
      return t;
    });
  }

  @Post(':id/events')
  async addEvent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEventDto, @Headers() h: Record<string, string>) {
    const isPublic = dto.public ?? true;
    const t = await db.ticket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Chamado não encontrado.');
    return db.$transaction(async (tx) => {
      const event = await tx.ticketEvent.create({
        data: { ticketId: id, type: isPublic ? 'RESPOSTA' : 'NOTA', public: isPublic, message: dto.message, authorName: me(h).name },
      });
      // Nota interna não sai do sistema.
      if (isPublic) await enqueue(tx, { type: 'ticket.replied', ...notifyFields(t), message: dto.message });
      return event;
    });
  }

  @Get(':id/attachments/:attachmentId')
  async download(@Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string, @Res() res: Response) {
    const a = await db.attachment.findFirst({ where: { id: attachmentId, ticketId: id } });
    if (!a) throw new NotFoundException('Anexo não encontrado.');
    res.setHeader('content-type', a.mime);
    res.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.sendFile(resolve(UPLOAD_DIR, a.path));
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
class PrismaErrorFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(e.code === 'P2003' || e.code === 'P2025' ? new NotFoundException('Chamado não encontrado.') : e, host);
  }
}

@Module({ controllers: [HealthController, TicketsController] })
export class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaErrorFilter(app.getHttpAdapter()), new UploadErrorFilter(app.getHttpAdapter()));
  app.enableShutdownHooks();
  startOutboxPublisher(db);
  await app.listen(process.env.PORT ?? 3000);
}
if (require.main === module) bootstrap();
