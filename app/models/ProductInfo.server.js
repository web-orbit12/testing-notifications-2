import db from "../db.server"; // Assuming db is your Prisma client setup

// Function to save product info
export async function saveProductInfo({ productSKU, email, minStock }) {
    await db.productSKU.create({ data: { sku: productSKU } });
    await db.email.create({ data: { email } });
    await db.stockThreshold.upsert({
      where: { id: 1 },
      update: { minStock },
      create: { minStock },
    });
  }

// Function to get product info (if needed)
export async function getProductInfo(id) {
  return await db.productInfo.findUnique({
    where: { id },
  });
}
