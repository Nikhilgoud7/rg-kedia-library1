-- CreateTable
CREATE TABLE "BookCover" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookCover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookCover_bookId_key" ON "BookCover"("bookId");

-- AddForeignKey
ALTER TABLE "BookCover" ADD CONSTRAINT "BookCover_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
