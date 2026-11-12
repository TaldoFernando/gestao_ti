-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fromName" TEXT,
    "toName" TEXT,
    "byName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Movement_equipmentId_at_idx" ON "Movement"("equipmentId", "at");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

