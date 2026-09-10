/**
 * Script de un solo uso: elimina el proveedor duplicado.
 * Ejecutar desde la raíz del proyecto:
 *   npx tsx scripts/delete-supplier.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SUPPLIER_ID = "16fdb941-0450-4728-bd93-f969e023bd2c";

async function main() {
  const supplier = await prisma.supplier.findUnique({
    where: { id: SUPPLIER_ID },
    include: {
      _count: {
        select: { invoices: true, invoiceBundles: true, orders: true },
      },
    },
  });

  if (!supplier) {
    console.log("Proveedor no encontrado. Puede que ya haya sido eliminado.");
    return;
  }

  console.log(`Proveedor encontrado: "${supplier.name}" (CIF: ${supplier.taxId ?? "—"})`);
  console.log(`  · Facturas:  ${supplier._count.invoices}`);
  console.log(`  · Bundles:   ${supplier._count.invoiceBundles}`);
  console.log(`  · Pedidos:   ${supplier._count.orders}`);

  // Borrado en cascada: primero facturas, bundles y pedidos, luego el proveedor
  await prisma.$transaction(async (tx) => {
    // Soft-delete de facturas
    await tx.invoice.updateMany({
      where: { supplierId: SUPPLIER_ID, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Borrar bundles (y sus facturas asociadas vía cascade del schema)
    await tx.invoiceBundle.deleteMany({ where: { supplierId: SUPPLIER_ID } });

    // Borrar pedidos y sus items (cascade en schema)
    await tx.order.deleteMany({ where: { supplierId: SUPPLIER_ID } });

    // Borrar el proveedor
    await tx.supplier.delete({ where: { id: SUPPLIER_ID } });
  });

  console.log("✓ Proveedor eliminado correctamente.");
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
