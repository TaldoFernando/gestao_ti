-- Vínculo do chamado com o equipamento do inventário (issue #15).
-- Só a referência: sem FK, o equipamento mora em outro banco (ADR 0002).
ALTER TABLE "Ticket" ADD COLUMN "equipmentId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_equipmentId_createdAt_idx" ON "Ticket"("equipmentId", "createdAt");
