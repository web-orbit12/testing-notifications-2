-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockThreshold" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "minStock" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StockThreshold" ("createdAt", "id", "minStock") SELECT "createdAt", "id", "minStock" FROM "StockThreshold";
DROP TABLE "StockThreshold";
ALTER TABLE "new_StockThreshold" RENAME TO "StockThreshold";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
