# PROJECT_STATUS — Cruz Blanca Gestión

> Este archivo es la fuente de verdad del estado del proyecto. Se actualiza al terminar cada fase. Leer este archivo antes de iniciar cualquier fase nueva.

---

## Estado actual

**Fase:** 2C — Documentos de empleados  
**Completada:** 2026-09-02  
**Siguiente fase:** 3 — Módulo de menú / carta  
**¿Lista para la Fase 3?** ⏳ Pendiente de revisión y aprobación del propietario.

---

## Historial de fases

### ✅ Fase 2A — Módulo RRHH (2026-09-02)

**Criterios de aceptación:**
- [x] CRUD de empleados con cifrado AES-256-GCM de campos sensibles (DNI/NIE, NAF, teléfono, dirección, contacto de emergencia)
- [x] HMAC-SHA256 para búsqueda de DNI sin descifrar toda la tabla
- [x] Contratos versionados: tipo, fechas, horas semanales/mensuales, jornada completa/parcial
- [x] Horarios semanales versionados: 7 días, tramo mañana/tarde, soporte cruce de medianoche
- [x] RBAC aplicado: ADMIN/RRHH acceso completo; ENCARGADO solo lee horarios; COCINA sin acceso
- [x] Auditoría de acceso a datos sensibles (sin DNI/NAF en metadata)
- [x] 92 tests unitarios pasan (22 validadores + 23 scheduleUtils + 11 cifrado + 29 permisos + 4 utils + 3 nuevos)
- [x] ESLint: sin errores ni advertencias
- [x] TypeScript strict: 0 errores

**Verificación en nube:**
- ✅ `npx vitest run` — 92/92 tests pasan
- ✅ `npx next lint` — sin errores
- ✅ `npx tsc --noEmit` — 0 errores

**Verificación en tu máquina (ejecutar antes de aprobar):**
```bash
cd "C:\Users\event\Downloads\Desktop\EVENTUALIA PROYECT"
npm install
npx prisma generate
npx prisma db push            # Crea tablas nuevas (employees, contracts, weekly_schedules, schedule_days)
npm run seed:dev              # Añade 5 empleados ficticios con contratos y horarios
npx tsc --noEmit              # 0 errores
npm run lint                  # 0 errores
npm run test                  # 92/92 pasan
docker compose up --build -d  # Rebuild con nueva imagen
# → Ir a http://localhost:3000/hr (con rol ADMIN o RRHH)
# → Verificar lista de empleados, detalle con contratos y horario
# → Ir a http://localhost:3000/hr/schedules (con rol ENCARGADO)
```

**Archivos nuevos en Fase 2A:**
```
prisma/schema.prisma                                     (actualizado)
prisma/seed.ts                                           (actualizado)
src/core/audit/events.ts                                 (actualizado)
src/core/audit/AuditService.ts                           (actualizado)
src/core/crypto/fieldEncryption.ts                       (nuevo)
src/modules/hr/types.ts                                  (nuevo)
src/modules/hr/lib/validators.ts                         (nuevo)
src/modules/hr/lib/scheduleUtils.ts                      (nuevo)
src/modules/hr/actions/employees.ts                      (nuevo)
src/modules/hr/actions/contracts.ts                      (nuevo)
src/modules/hr/actions/schedules.ts                      (nuevo)
src/modules/hr/components/StatusBadge.tsx                (nuevo)
src/modules/hr/components/EmployeeForm.tsx               (nuevo)
src/modules/hr/components/ContractForm.tsx               (nuevo)
src/modules/hr/components/ScheduleForm.tsx               (nuevo)
src/modules/hr/components/ScheduleFormWrapper.tsx        (nuevo)
src/app/(dashboard)/hr/page.tsx                          (nuevo)
src/app/(dashboard)/hr/new/page.tsx                      (nuevo)
src/app/(dashboard)/hr/[id]/page.tsx                     (nuevo)
src/app/(dashboard)/hr/[id]/edit/page.tsx                (nuevo)
src/app/(dashboard)/hr/schedules/page.tsx                (nuevo)
tests/unit/fieldEncryption.test.ts                       (nuevo)
tests/unit/validators.test.ts                            (nuevo)
tests/unit/scheduleUtils.test.ts                         (nuevo)
```

---

### ✅ Fase 2C — Documentos de empleados (2026-09-02)

**Criterios de aceptación:**
- [x] Modelos Prisma: `EmployeeDocument`, `StoredFile`, enums `EmployeeDocCategory` y `EmployeeDocStatus`
- [x] Subida segura: validación MIME real (magic bytes), SHA-256, detección de duplicados por empleado
- [x] Sanitización de nombre de archivo; clave de almacenamiento opaca (sin DNI/nombre en ruta)
- [x] Borrado lógico: `deletedAt` / `deletedById`; restauración
- [x] Cambio de estado `PENDING` ↔ `SIGNED`
- [x] Descarga autenticada: sesión + permiso `hr:documents:read` + existencia en BD verificada
- [x] Auditoría de subida, borrado, restauración y descarga
- [x] RBAC: `hr:documents:read` / `hr:documents:write` → ADMIN, RRHH; ENCARGADO sin acceso
- [x] Pestaña "Documentos" en ficha de empleado: lista agrupada por año, formulario drag-and-drop
- [x] Vista de papelera con restauración desde la pestaña
- [x] 154 tests unitarios pasan (+35 nuevos: detectMime, validateDocumentBuffer, sanitizeFilename, sha256Hex…)
- [x] ESLint: sin errores ni advertencias
- [x] TypeScript strict: 0 errores

**Verificación en nube:**
- ✅ `npx vitest run` — 154/154 tests pasan
- ✅ `npx next lint` — sin errores
- ✅ `npx tsc --noEmit` — 0 errores

**Verificación en tu máquina (ejecutar antes de aprobar):**
```bash
cd "C:\Users\event\Downloads\Desktop\EVENTUALIA PROYECT"
npx prisma db push            # crea tablas stored_files, employee_documents
npx tsc --noEmit              # 0 errores
npm run lint                  # 0 errores
npm run test                  # 154/154 pasan
docker compose up --build -d  # rebuild
# → Ir a un empleado (ADMIN o RRHH) → pestaña "Documentos"
# → Subir un PDF, JPEG o PNG; verificar categoría, estado, descarga
# → Borrar un documento → ver en papelera → restaurar
# → Cambiar estado PENDING ↔ SIGNED
# → ENCARGADO no debe ver la pestaña Documentos
```

**Archivos nuevos en Fase 2C:**
```
prisma/schema.prisma                                               (actualizado: EmployeeDocument, StoredFile)
src/modules/hr/lib/documentUtils.ts                                (nuevo)
src/modules/hr/actions/employeeDocuments.ts                        (nuevo)
src/modules/hr/components/DocumentUploadForm.tsx                   (nuevo)
src/modules/hr/components/DocumentActions.tsx                      (nuevo)
src/app/(dashboard)/hr/[id]/page.tsx                               (actualizado: pestaña Documentos)
src/app/api/files/employee-docs/[fileId]/route.ts                  (nuevo)
tests/unit/documentUtils.test.ts                                   (nuevo)
```

---

### ✅ Fase 2B — Registro de jornada y PDF (2026-09-02)

**Criterios de aceptación:**
- [x] Modelos Prisma: `TimeRecord`, `TimeRecordDay`, `TimeRecordPdf` con enums `TimeRecordStatus` y `DayType`
- [x] Flujo DRAFT → CLOSED → DRAFT (reapertura con motivo obligatorio ≥ 10 caracteres)
- [x] Pre-carga automática de días desde horario habitual al crear el registro
- [x] Edición inline de cada día: tipo, tramos horarios, minutos ordinarios/extras, observación
- [x] Generación de PDF con `@react-pdf/renderer` (solo servidor): A4 landscape, empresa + empleado + tabla días + totales + firmas
- [x] Almacenamiento de PDFs con clave opaca (sin nombre/DNI en la ruta): `StorageProvider`
- [x] Descarga segura de PDF: comprueba sesión + permiso + existencia en BD antes de servir
- [x] Snapshots de contrato y horario sin campos sensibles cifrados
- [x] RBAC: `hr:records:read` / `hr:records:write` → ADMIN, RRHH; ENCARGADO sin acceso
- [x] Pestaña "Jornada" en ficha de empleado con lista de registros y botón "Crear registro"
- [x] Configuración de empresa (`app_settings`): ADMIN puede editar nombre, CIF, dirección, teléfono
- [x] 119 tests unitarios pasan (+27 nuevos: calcDayMinutes, buildMonthPresets, sumMinutes, formatMonthYear…)
- [x] ESLint: sin errores ni advertencias
- [x] TypeScript strict: 0 errores

**Verificación en nube:**
- ✅ `npx vitest run` — 119/119 tests pasan
- ✅ `npx next lint` — sin errores
- ✅ `npx tsc --noEmit` — 0 errores

**Verificación en tu máquina (ejecutar antes de aprobar):**
```bash
cd "C:\Users\event\Downloads\Desktop\EVENTUALIA PROYECT"
npm install                   # instala @react-pdf/renderer si no está
npx prisma db push            # crea tablas time_records, time_record_days, time_record_pdfs
npx tsc --noEmit              # 0 errores
npm run lint                  # 0 errores
npm run test                  # 119/119 pasan
docker compose up --build -d  # rebuild
# → Ir a un empleado → pestaña Jornada → "Crear registro"
# → Editar días, cerrar, generar PDF, descargar desde /api/files/time-records/...
# → Ir a /admin/settings (ADMIN) → configurar empresa
```

**Archivos nuevos en Fase 2B:**
```
prisma/schema.prisma                                          (actualizado: TimeRecord, TimeRecordDay, TimeRecordPdf)
next.config.ts                                                (actualizado: @react-pdf/renderer en serverExternalPackages)
src/core/storage/StorageProvider.ts                           (nuevo)
src/core/pdf/timeRecordPdf.tsx                                (nuevo)
src/modules/hr/lib/timeRecordUtils.ts                         (nuevo)
src/modules/hr/actions/timeRecords.ts                         (nuevo)
src/modules/hr/actions/appSettings.ts                         (nuevo)
src/modules/hr/components/DayEditorWrapper.tsx                (nuevo)
src/modules/hr/components/CloseRecordButton.tsx               (nuevo)
src/modules/hr/components/ReopenRecordButton.tsx              (nuevo)
src/modules/hr/components/GeneratePdfButton.tsx               (nuevo)
src/app/(dashboard)/hr/[id]/page.tsx                          (actualizado: pestaña Jornada)
src/app/(dashboard)/hr/time-records/new/page.tsx              (nuevo)
src/app/(dashboard)/hr/time-records/[recordId]/page.tsx       (nuevo)
src/app/(dashboard)/admin/settings/page.tsx                   (nuevo)
src/app/api/files/time-records/[storageKey]/route.ts          (nuevo)
tests/unit/timeRecordUtils.test.ts                            (nuevo)
```

---

### ✅ Fase 1 — Núcleo ejecutable (2026-09-02)

**Criterios de aceptación:**
- [x] Docker Compose (app + PostgreSQL) arranca con `docker compose up`
- [x] Prisma con migraciones reproducibles y seed de desarrollo
- [x] Auth.js con login local + Argon2id (64 MB / 3 iteraciones / 1 hilo)
- [x] RBAC completo desde el inicio (ADMIN, RRHH, ENCARGADO, COCINA)
- [x] Guards servidor: middleware + `requireSession()` + `requirePermission()`
- [x] Layout autenticado con sidebar y menú de usuario
- [x] Dashboard provisional con tarjetas de módulos filtradas por rol
- [x] Endpoint `/api/health` sin secretos
- [x] `.env.example` sin valores reales
- [x] 29 tests unitarios pasan (permisos RBAC + utilidades)
- [x] Tests E2E de autenticación escritos (requieren app corriendo)
- [x] ESLint: sin errores ni advertencias
- [x] Seed idempotente con 4 usuarios ficticios y `mustChangePwd=true`
- [x] Lockout por intentos fallidos (5 intentos → 15 min bloqueado)
- [x] Flujo `mustChangePwd`: middleware redirige a `/change-password`

**Verificación en nube (sin acceso a binarios Prisma):**
- ✅ `npx vitest run` — 29/29 tests pasan
- ✅ `npx next lint` — sin errores

**Verificación en tu máquina (ejecutar antes de aprobar):**
```bash
cd "C:\Users\event\Downloads\Desktop\EVENTUALIA PROYECT"
npm install
npx prisma generate
npx tsc --noEmit       # 0 errores
npm run lint           # 0 errores
npm run test           # 29/29 pasan
docker compose up -d   # App en http://localhost:3000
# → Hacer login con admin@cruzblanca.local / Provisional1234!
# → Verificar redirección a /change-password
# → Verificar que /hr redirige a /login si no hay sesión
```

**Archivos creados:**
```
.env.example
.eslintrc.json
.gitignore
Dockerfile
docker-compose.yml
docker-compose.prod.yml
next.config.ts
package.json
playwright.config.ts
postcss.config.mjs
prisma/schema.prisma
prisma/seed.ts
src/app/(auth)/change-password/actions.ts
src/app/(auth)/change-password/page.tsx
src/app/(auth)/layout.tsx
src/app/(auth)/login/actions.ts
src/app/(auth)/login/page.tsx
src/app/(dashboard)/layout.tsx
src/app/(dashboard)/page.tsx
src/app/api/auth/[...nextauth]/route.ts
src/app/api/health/route.ts
src/app/globals.css
src/app/layout.tsx
src/auth.ts
src/components/layout/Sidebar.tsx
src/components/layout/UserMenu.tsx
src/core/audit/AuditService.ts
src/core/audit/events.ts
src/core/auth/permissions.ts
src/core/auth/session.ts
src/core/config/env.ts
src/core/db/client.ts
src/lib/utils.ts
src/middleware.ts
src/types/next-auth.d.ts
tailwind.config.ts
tests/e2e/auth.spec.ts
tests/unit/permissions.test.ts
tests/unit/setup.ts
tests/unit/utils.test.ts
tsconfig.json
vitest.config.ts
```

---

### ✅ Fase 0 — Arquitectura y documentación (2026-09-02)

**Criterios de aceptación:**
- [x] Arquitectura documentada (`docs/ARCHITECTURE.md`)
- [x] Modelo de datos inicial revisable (`docs/DATA_MODEL.md`)
- [x] Decisiones de seguridad documentadas (`docs/SECURITY.md`)
- [x] Política de backup documentada (`docs/BACKUP_RESTORE.md`)
- [x] README.md con arranque rápido y convenciones
- [x] PROJECT_STATUS.md inicializado
- [x] Riesgos y supuestos visibles

**Archivos creados:**
```
README.md
docs/ARCHITECTURE.md
docs/DATA_MODEL.md
docs/SECURITY.md
docs/BACKUP_RESTORE.md
PROJECT_STATUS.md
```

**Pasos manuales del propietario antes de la Fase 1:** Ver sección "Decisiones pendientes".

---

## Decisiones tomadas

| ID | Decisión | Justificación | Fase |
|----|----------|---------------|------|
| D01 | Stack: Next.js App Router + TypeScript + Prisma + Auth.js + Tailwind + shadcn/ui | Stack maduro, buen soporte Docker, Server Actions simplifican la arquitectura | 0 |
| D02 | PostgreSQL como única base de datos | Confiable, buen soporte Prisma, backups sencillos | 0 |
| D03 | Monolito modular (no microservicios) | Una persona puede operarlo; un desarrollador puede mantenerlo | 0 |
| D04 | Argon2id para contraseñas | Más resistente que bcrypt frente a ataques GPU/ASIC | 0 |
| D05 | AES-256-GCM para cifrado de campos (DNI/NIE, NAF, teléfono) | Cifrado autenticado; detecta manipulación | 0 |
| D06 | HMAC-SHA256 para hash de búsqueda de campos cifrados | Permite búsqueda exacta sin descifrar todos los registros | 0 |
| D07 | Dinero en céntimos enteros (INTEGER) | Evita errores de redondeo con float | 0 |
| D08 | Fechas en UTC en BD; mostradas en Europe/Madrid | Inequívoco en almacenamiento; correcto en la UI | 0 |
| D09 | Soft delete para empleados y documentos | El historial laboral nunca se destruye | 0 |
| D10 | StorageProvider como interfaz intercambiable | Permite migrar a S3 sin tocar módulos | 0 |
| D11 | Tailscale como opción principal de acceso remoto | Sin abrir puertos, VPN privada, gratuito hasta cierto uso | 0 |
| D12 | PDF server-side: evaluar @react-pdf/renderer vs puppeteer-core en Fase 1 | Decisión final en Fase 2B cuando se diseñe el PDF de jornada | 0 |
| D13 | Contratos y horarios versionados (historial inmutable) | Los meses cerrados no pueden verse afectados por cambios futuros | 0 |
| D14 | snapshot JSON del contrato/horario en time_records | Desvincula el registro mensual de cambios posteriores del perfil | 0 |
| D15 | Disco de datos: `D:\CruzBlancaDatos\` | Decisión del propietario; separar datos del disco de sistema | 0 |
| D16 | Desarrollo en PC actual → migración al PC del restaurante en Fase 4 | El PC de producción es el que siempre está encendido; se documenta migración en Fase 4 | 0 |
| D17 | UUID v4 para todos los IDs (no ULID) | Soporte nativo Prisma, sin dependencia extra; el orden cronológico no es crítico | 0 |
| D18 | ENCARGADO en RRHH: solo puede ver horarios de todos los empleados (sin fichas, contratos, documentos ni salarios) | Decisión del propietario (2026-09-02) | 0 |
| D19 | ENCARGADO en Menú: puede editar y generar PDFs | Definido en el plan original | 0 |

---

## Decisiones pendientes (bloqueantes)

Estas preguntas deben resolverse antes de la fase indicada. Responderlas aquí cuando estén disponibles.

| ID | Pregunta | Necesaria en | Estado |
|----|----------|-------------|--------|
| P01 | Ruta/disco definitivo para datos y documentos | Fase 1 (.env) | ✅ `D:\CruzBlancaDatos\` |
| P02 | ¿Qué puede hacer el ENCARGADO en RRHH? | Fase 1 (permisos) | ✅ Ver horarios de todos los empleados. Sin fichas, contratos, documentos ni salarios. ⚠️ Pendiente: ¿horarios de todos o solo los del turno que gestiona? |
| P03 | Datos legales de la empresa: razón social, CIF, CCC | Fase 2B (PDF jornada) | ⏳ Pendiente |
| P04 | Logo de Cruz Blanca en PNG/SVG de alta calidad | Fase 2B / Fase 3 | ⏳ Pendiente |
| P05 | Tipografías y textos legales exactos de los PDFs | Fase 2B / Fase 3 | ⏳ Pendiente |
| P06 | ¿Una o dos franjas diarias habituales en el registro de jornada? | Fase 2B | ⏳ Pendiente |
| P07 | Número máximo habitual de platos por sección de menú | Fase 3 | ⏳ Pendiente |
| P08 | ¿Tailscale o Cloudflare Tunnel para acceso exterior? | Fase 4 | ⏳ Pendiente |
| P09 | Destino de la copia de seguridad externa (Backblaze, MEGA, NAS…) | Fase 4 | ⏳ Pendiente |
| P10 | ¿Cifrar también email y dirección del empleado? | Fase 2A | ✅ Dirección cifrada (addressEncrypted). Email en claro (necesario para Auth.js). |
| P11 | ¿UUID v4 o ULID para IDs? | Fase 1 | ✅ UUID v4 (ver D17) |

---

## Variables de entorno necesarias

Todas irán en `.env` (nunca en el repositorio). El archivo `.env.example` se creará en Fase 1.

```
# Base de datos
DATABASE_URL=postgresql://user:password@db:5432/cruzblanca

# Auth.js
AUTH_SECRET=<32+ bytes aleatorios en hex>
NEXTAUTH_URL=http://localhost:3000

# Cifrado de campos sensibles
FIELD_ENCRYPTION_KEY=<32 bytes en hex>
SEARCH_HMAC_KEY=<32 bytes en hex>

# Almacenamiento
STORAGE_PROVIDER=local
STORAGE_LOCAL_PATH=/app/data/documents

# App
NODE_ENV=development
TZ=Europe/Madrid
LOG_LEVEL=info
MAX_UPLOAD_SIZE_MB=20

# PostgreSQL (para el contenedor de BD)
POSTGRES_USER=cruzblanca
POSTGRES_PASSWORD=<password>
POSTGRES_DB=cruzblanca
```

---

## Migraciones aplicadas

| Nº | Nombre | Fecha | Fase |
|----|--------|-------|------|
| 001 | `20260902_init_core` | 2026-09-02 | 1 |

---

## Comandos de referencia rápida

```bash
# Levantar el sistema
docker compose up -d

# Ver logs
docker compose logs -f app
docker compose logs -f db

# Ejecutar migraciones
docker compose exec app npx prisma migrate deploy

# Crear una migración nueva (desarrollo)
docker compose exec app npx prisma migrate dev --name <descripcion>

# Seed de desarrollo (datos ficticios)
docker compose exec app npm run seed:dev

# Backup manual
./scripts/backup.sh

# Tests
docker compose exec app npm run test          # Vitest
docker compose exec app npm run test:e2e      # Playwright

# Lint y typecheck
docker compose exec app npm run lint
docker compose exec app npm run typecheck
```

---

## Pruebas realizadas por fase

### Fase 0
- No aplica (solo documentación).

---

## Pendientes y notas

- Verificar disponibilidad de Docker Desktop en el PC del restaurante antes de iniciar Fase 1.
- El PDF del menú del día existe como referencia visual (`menudeldiailustrador2 [Recuperado].pdf`) en la carpeta del proyecto — revisar en Fase 3 para reproducir la composición.
- No usar datos reales de empleados durante el desarrollo. Seed solo con personas ficticias.
- Recordar: no avanzar de fase sin que el propietario haya revisado y aprobado la anterior.

---

## Registro de cambios de este archivo

| Fecha | Cambio |
|-------|--------|
| 2026-09-02 | Creación inicial — Fase 0 completada |
| 2026-09-02 | Decisiones P01 (disco D:), P02 (permisos ENCARGADO), P11 (UUID v4) resueltas por el propietario |
| 2026-09-02 | Fase 1 completada — núcleo ejecutable implementado (29 tests, lint limpio) |
| 2026-09-02 | Fase 2A completada — módulo RRHH (92 tests, lint limpio, tsc 0 errores) |
