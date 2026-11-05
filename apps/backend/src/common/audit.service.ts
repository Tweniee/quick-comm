import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';

export interface AuditEntry {
  actorType: 'ADMIN' | 'BUSINESS' | 'DRIVER' | 'SYSTEM';
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(e: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    return db.auditLog.create({
      data: {
        actorType: e.actorType,
        actorId: e.actorId ?? null,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
        oldValue: (e.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (e.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: e.reason ?? null,
        ip: e.ip ?? null,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
