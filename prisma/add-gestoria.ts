/**
 * Script de producción: crea el rol GESTORIA y el usuario de la gestora.
 * Idempotente — se puede ejecutar varias veces sin duplicar datos.
 *
 * Uso (dentro del contenedor de la app):
 *   npx tsx prisma/add-gestoria.ts
 *
 * O desde Windows (si el contenedor se llama "eventualia-app-1"):
 *   docker exec -it eventualia-app-1 npx tsx prisma/add-gestoria.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

const GESTORIA_PERMISSIONS = ["gestoria:read", "gestoria:write"];
const ENCARGADO_EXTRA_PERMISSIONS = ["gestoria:read", "gestoria:write"];

async function main() {
  console.log("🔧 Configurando rol GESTORIA...\n");

  // 1. Crear rol GESTORIA
  const gestoriaRole = await prisma.role.upsert({
    where: { name: "GESTORIA" },
    update: { description: "Acceso de solo lectura a la sección de gestoría" },
    create: {
      name: "GESTORIA",
      description: "Acceso de solo lectura a la sección de gestoría",
    },
  });
  console.log(`  ✓ Rol GESTORIA: ${gestoriaRole.id}`);

  // 2. Crear permisos de gestoría (si no existen)
  const allNewPerms = [...new Set([...GESTORIA_PERMISSIONS, ...ENCARGADO_EXTRA_PERMISSIONS])];
  const permMap: Record<string, { id: string }> = {};
  for (const action of allNewPerms) {
    const p = await prisma.permission.upsert({
      where: { action },
      update: {},
      create: { action },
    });
    permMap[action] = p;
    console.log(`  ✓ Permiso: ${action}`);
  }

  // 3. Asignar gestoria:read a rol GESTORIA
  for (const action of GESTORIA_PERMISSIONS) {
    const permissionId = permMap[action]?.id;
    if (!permissionId) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: gestoriaRole.id, permissionId } },
      update: {},
      create: { roleId: gestoriaRole.id, permissionId },
    });
  }
  console.log("  ✓ Permisos gestoria:read y gestoria:write asignados a GESTORIA");

  // 4. Añadir gestoria:read y gestoria:write a ENCARGADO (ya tiene suppliers:read)
  const encargadoRole = await prisma.role.findUnique({ where: { name: "ENCARGADO" } });
  if (encargadoRole) {
    for (const action of ENCARGADO_EXTRA_PERMISSIONS) {
      const permissionId = permMap[action]?.id;
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: encargadoRole.id, permissionId } },
        update: {},
        create: { roleId: encargadoRole.id, permissionId },
      });
    }
    console.log("  ✓ gestoria:read y gestoria:write añadidos a ENCARGADO");
  }

  // 5. Crear usuario de la gestora
  const email = "gestoria@eventualia17.es";
  const provisionalPassword = "Gestoria2024!";
  const passwordHash = await hash(provisionalPassword, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const gestoriaUser = await prisma.user.upsert({
    where: { email },
    update: {
      // Si ya existe, solo actualizamos el rol (no el password para no sobreescribir uno personalizado)
      roleId: gestoriaRole.id,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      name: "Gestoría",
      roleId: gestoriaRole.id,
      isActive: true,
      mustChangePwd: true,
    },
  });

  const isNew = gestoriaUser.mustChangePwd;
  console.log(`\n  ✓ Usuario gestora: ${gestoriaUser.email}`);

  console.log("\n✅ Configuración completada.\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Usuario: ${email}`);
  if (isNew) {
    console.log(`  Contraseña temporal: ${provisionalPassword}`);
    console.log("  ⚠  El usuario deberá cambiar la contraseña en el primer login.");
  } else {
    console.log("  (usuario ya existía — contraseña no modificada)");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
