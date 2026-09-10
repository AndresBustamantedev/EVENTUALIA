/**
 * Seed de desarrollo — solo datos ficticios
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos
 *
 * IMPORTANTE: Todos los empleados, DNI, NAF, teléfonos y datos personales
 * son ficticios. No usar datos reales de personas durante el desarrollo.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { encrypt, hashForSearch } from "../src/core/crypto/fieldEncryption";

const prisma = new PrismaClient();

// ── ROLES ────────────────────────────────────────────────────
const ROLES = [
  { name: "ADMIN", description: "Acceso total al sistema" },
  {
    name: "RRHH",
    description: "Gestión completa de recursos humanos",
  },
  {
    name: "ENCARGADO",
    description:
      "Gestión de menús y consulta de horarios de empleados",
  },
  {
    name: "COCINA",
    description: "Consulta del menú del día vigente",
  },
];

// ── PERMISOS ─────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  // Administración
  "users:manage",
  "system:settings",
  "system:audit",
  // RRHH — empleados
  "hr:employees:read",
  "hr:employees:write",
  // RRHH — contratos
  "hr:contracts:read",
  "hr:contracts:write",
  // RRHH — horarios (ENCARGADO puede leer de todos)
  "hr:schedules:read",
  "hr:schedules:write",
  // RRHH — registros de jornada
  "hr:records:read",
  "hr:records:write",
  // RRHH — documentos laborales
  "hr:documents:read",
  "hr:documents:write",
  // Menú
  "menu:read",
  "menu:write",
  "menu:pdf:generate",
  // Proveedores
  "suppliers:read",
  "suppliers:write",
];

// ── PERMISOS POR ROL ─────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS,
  RRHH: [
    "hr:employees:read",
    "hr:employees:write",
    "hr:contracts:read",
    "hr:contracts:write",
    "hr:schedules:read",
    "hr:schedules:write",
    "hr:records:read",
    "hr:records:write",
    "hr:documents:read",
    "hr:documents:write",
    "menu:read",
    "menu:write",
    "menu:pdf:generate",
  ],
  ENCARGADO: [
    "hr:schedules:read", // ver horarios de todos (sin datos sensibles)
    "menu:read",
    "menu:write",
    "menu:pdf:generate",
  ],
  COCINA: [
    "menu:read", // solo menú del día vigente
  ],
};

// ── CONFIGURACIÓN INICIAL DE EMPRESA ─────────────────────────
const DEFAULT_SETTINGS = [
  { key: "company.name", value: "Cruz Blanca Coimbra" },
  { key: "company.cif", value: "B88119391" },
  { key: "company.ccc", value: "000-0000-00-0000000000 (provisional)" },
  { key: "company.address", value: "" },
  { key: "company.signatureName", value: "Eventualia Central de Servicios 17 S.L" },
  {
    key: "timerecord.legal_text",
    value:
      "El trabajador y la empresa firman el presente registro de jornada en conformidad con lo dispuesto en el artículo 34.9 del Estatuto de los Trabajadores.",
  },
];

// ── EMPLEADOS FICTICIOS ───────────────────────────────────────
// Todos los datos personales son inventados. No corresponden a personas reales.
type FakeEmployee = {
  firstName: string;
  lastName: string;
  email: string;
  status: "ACTIVE" | "INACTIVE" | "TERMINATED";
  hireDate: Date;
  dni: string;
  naf: string;
  phone: string;
  address: string;
  notes?: string;
};

const FAKE_EMPLOYEES: FakeEmployee[] = [
  {
    firstName: "Laura",
    lastName: "Fernández Ramos",
    email: "laura.fernandez@cruzblanca.local",
    status: "ACTIVE",
    hireDate: new Date("2021-03-15"),
    dni: "12345678A",
    naf: "28123456701",
    phone: "612000001",
    address: "Calle Ficticia 1, 28001 Madrid",
    notes: "Responsable de sala. Turno partido.",
  },
  {
    firstName: "Carlos",
    lastName: "Martínez López",
    email: "carlos.martinez@cruzblanca.local",
    status: "ACTIVE",
    hireDate: new Date("2020-07-01"),
    dni: "23456789B",
    naf: "28123456702",
    phone: "623000002",
    address: "Avenida Inventada 2, 28002 Madrid",
    notes: "Cocinero jefe. Turno mañana.",
  },
  {
    firstName: "Ana",
    lastName: "García Pérez",
    email: "ana.garcia@cruzblanca.local",
    status: "ACTIVE",
    hireDate: new Date("2022-09-01"),
    dni: "34567890C",
    naf: "28123456703",
    phone: "634000003",
    address: "Plaza Imaginaria 3, 28003 Madrid",
  },
  {
    firstName: "David",
    lastName: "Sánchez Torres",
    email: "david.sanchez@cruzblanca.local",
    status: "ACTIVE",
    hireDate: new Date("2023-01-10"),
    dni: "45678901D",
    naf: "28123456704",
    phone: "645000004",
    address: "Calle Inventada 4, 28004 Madrid",
  },
  {
    firstName: "María",
    lastName: "Rodríguez Blanco",
    email: "maria.rodriguez@cruzblanca.local",
    status: "INACTIVE",
    hireDate: new Date("2019-05-20"),
    dni: "56789012E",
    naf: "28123456705",
    phone: "656000005",
    address: "Travesía Ficticia 5, 28005 Madrid",
    notes: "Baja médica temporal.",
  },
];

// Horario típico de restaurante — turno partido
function schedulePartido(adminId: string, employeeId: string) {
  return {
    employeeId,
    effectiveFrom: new Date("2024-01-01"),
    createdById: adminId,
    days: {
      create: [
        { dayOfWeek: 1, isRestDay: false, morningStart: "09:00", morningEnd: "16:00", afternoonStart: "19:00", afternoonEnd: "23:00" },
        { dayOfWeek: 2, isRestDay: false, morningStart: "09:00", morningEnd: "16:00", afternoonStart: "19:00", afternoonEnd: "23:00" },
        { dayOfWeek: 3, isRestDay: true },
        { dayOfWeek: 4, isRestDay: false, morningStart: "09:00", morningEnd: "16:00", afternoonStart: "19:00", afternoonEnd: "23:00" },
        { dayOfWeek: 5, isRestDay: false, morningStart: "09:00", morningEnd: "16:00", afternoonStart: "19:00", afternoonEnd: "23:00" },
        { dayOfWeek: 6, isRestDay: false, morningStart: "10:00", morningEnd: "16:00", afternoonStart: "20:00", afternoonEnd: "00:00" },
        { dayOfWeek: 7, isRestDay: true },
      ],
    },
  };
}

// Horario de cocina — turno mañana
function scheduleMañana(adminId: string, employeeId: string) {
  return {
    employeeId,
    effectiveFrom: new Date("2024-01-01"),
    createdById: adminId,
    days: {
      create: [
        { dayOfWeek: 1, isRestDay: false, morningStart: "08:00", morningEnd: "16:00" },
        { dayOfWeek: 2, isRestDay: false, morningStart: "08:00", morningEnd: "16:00" },
        { dayOfWeek: 3, isRestDay: false, morningStart: "08:00", morningEnd: "16:00" },
        { dayOfWeek: 4, isRestDay: false, morningStart: "08:00", morningEnd: "16:00" },
        { dayOfWeek: 5, isRestDay: false, morningStart: "08:00", morningEnd: "16:00" },
        { dayOfWeek: 6, isRestDay: true },
        { dayOfWeek: 7, isRestDay: true },
      ],
    },
  };
}

async function main() {
  console.log("🌱 Iniciando seed de desarrollo...");

  // 1. Crear roles
  const roleMap: Record<string, { id: string }> = {};
  for (const role of ROLES) {
    const r = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
    roleMap[role.name] = r;
    console.log(`  ✓ Rol: ${role.name}`);
  }

  // 2. Crear permisos
  const permMap: Record<string, { id: string }> = {};
  for (const action of ALL_PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { action },
      update: {},
      create: { action },
    });
    permMap[action] = p;
  }
  console.log(`  ✓ ${ALL_PERMISSIONS.length} permisos creados`);

  // 3. Asignar permisos a roles
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleName]?.id;
    if (!roleId) continue;
    for (const action of perms) {
      const permissionId = permMap[action]?.id;
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }
  console.log("  ✓ Permisos asignados a roles");

  // 4. Usuario administrador ficticio
  const adminRole = roleMap["ADMIN"];
  if (!adminRole) throw new Error("Rol ADMIN no encontrado");

  const provisionalPassword = "Provisional1234!";
  const passwordHash = await hash(provisionalPassword, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@cruzblanca.local" },
    update: {},
    create: {
      email: "admin@cruzblanca.local",
      passwordHash,
      name: "Administrador",
      roleId: adminRole.id,
      isActive: true,
      mustChangePwd: true, // obligar a cambiar en primer login
    },
  });
  console.log(`  ✓ Usuario admin: ${adminUser.email}`);
  console.log(
    `    ⚠  Contraseña provisional: ${provisionalPassword} (cambiar en primer login)`
  );

  // 5. Usuario RRHH ficticio
  const rrhRole = roleMap["RRHH"];
  if (rrhRole) {
    await prisma.user.upsert({
      where: { email: "rrhh@cruzblanca.local" },
      update: {},
      create: {
        email: "rrhh@cruzblanca.local",
        passwordHash: await hash("Provisional1234!", {
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
        name: "Gestor RRHH (ficticio)",
        roleId: rrhRole.id,
        isActive: true,
        mustChangePwd: true,
      },
    });
    console.log("  ✓ Usuario rrhh@cruzblanca.local (ficticio)");
  }

  // 6. Usuario ENCARGADO ficticio
  const encRole = roleMap["ENCARGADO"];
  if (encRole) {
    await prisma.user.upsert({
      where: { email: "encargado@cruzblanca.local" },
      update: {},
      create: {
        email: "encargado@cruzblanca.local",
        passwordHash: await hash("Provisional1234!", {
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
        name: "Encargado (ficticio)",
        roleId: encRole.id,
        isActive: true,
        mustChangePwd: true,
      },
    });
    console.log("  ✓ Usuario encargado@cruzblanca.local (ficticio)");
  }

  // 7. Usuario COCINA ficticio
  const cocinaRole = roleMap["COCINA"];
  if (cocinaRole) {
    await prisma.user.upsert({
      where: { email: "cocina@cruzblanca.local" },
      update: {},
      create: {
        email: "cocina@cruzblanca.local",
        passwordHash: await hash("Provisional1234!", {
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
        name: "Cocina (ficticio)",
        roleId: cocinaRole.id,
        isActive: true,
        mustChangePwd: true,
      },
    });
    console.log("  ✓ Usuario cocina@cruzblanca.local (ficticio)");
  }

  // 8. Configuración inicial
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log("  ✓ Configuración inicial de empresa");

  // 9. Empleados ficticios (solo si no existen)
  const existingCount = await prisma.employee.count();
  if (existingCount === 0) {
    console.log("\n  Creando empleados ficticios (Fase 2A)…");

    for (const emp of FAKE_EMPLOYEES) {
      const dniHash = hashForSearch(emp.dni);
      const created = await prisma.employee.create({
        data: {
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          status: emp.status,
          hireDate: emp.hireDate,
          notes: emp.notes ?? null,
          dniEncrypted: encrypt(emp.dni),
          dniHash,
          nafEncrypted: encrypt(emp.naf),
          phoneEncrypted: encrypt(emp.phone),
          addressEncrypted: encrypt(emp.address),
          createdById: adminUser.id,
        },
      });

      // Contrato ficticio para empleados activos
      if (emp.status === "ACTIVE") {
        await prisma.contract.create({
          data: {
            employeeId: created.id,
            contractType: "indefinido",
            startDate: emp.hireDate,
            weeklyHours: 40,
            monthlyHours: 173.33,
            isFullTime: true,
            createdById: adminUser.id,
          },
        });
      }

      // Horario ficticio para los dos primeros empleados activos
      const scheduleData =
        emp.firstName === "Laura"
          ? schedulePartido(adminUser.id, created.id)
          : emp.firstName === "Carlos"
            ? scheduleMañana(adminUser.id, created.id)
            : null;

      if (scheduleData) {
        await prisma.weeklySchedule.create({ data: scheduleData });
      }

      console.log(`    ✓ ${emp.firstName} ${emp.lastName} (ficticio)`);
    }
  } else {
    console.log(
      `  ⏭  ${existingCount} empleado(s) ya existentes — omitiendo`
    );
  }

  console.log("\n✅ Seed completado.");
  console.log("\nUsuarios de desarrollo disponibles:");
  console.log(
    "  admin@cruzblanca.local     / Provisional1234!  (ADMIN)"
  );
  console.log(
    "  rrhh@cruzblanca.local      / Provisional1234!  (RRHH)"
  );
  console.log(
    "  encargado@cruzblanca.local / Provisional1234!  (ENCARGADO)"
  );
  console.log(
    "  cocina@cruzblanca.local    / Provisional1234!  (COCINA)"
  );
  console.log(
    "\n  ⚠  Todos los usuarios deben cambiar la contraseña en el primer login."
  );
  console.log(
    "  ⚠  Todos los empleados y datos personales son ficticios."
  );
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
