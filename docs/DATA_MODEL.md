# Modelo de datos — Cruz Blanca Gestión

> Este documento describe el modelo de datos inicial (Fase 0). Se actualizará al inicio de cada fase antes de escribir código.

## Convenciones globales

- Todas las tablas tienen `id` como UUID v4 (generado por la BD).
- `created_at` y `updated_at` con zona horaria explícita (TIMESTAMPTZ).
- Fechas de negocio (fecha de contrato, fecha de jornada…) en tipo `DATE` o `TIMESTAMPTZ` con comentario que justifica la elección.
- **Dinero siempre en céntimos enteros** (`INTEGER`). Nunca `FLOAT` ni `DECIMAL` para importes monetarios.
- Soft delete mediante campo `deleted_at TIMESTAMPTZ` o estado `archived`/`inactive` según la entidad. Nunca borrado físico de empleados o documentos con historial.
- Campos sensibles (DNI/NIE, NAF, IBAN): cifrados a nivel de aplicación con clave del entorno. El cifrado se documenta en `SECURITY.md`.
- Nombres de tabla y columna en **inglés, snake_case**.

---

## Núcleo

### `users`

Cuentas de acceso al sistema. No son los empleados del restaurante (aunque pueden coincidir).

```
id              UUID PK
email           TEXT UNIQUE NOT NULL
password_hash   TEXT NOT NULL          -- Argon2id, nunca en logs
name            TEXT NOT NULL
role_id         UUID FK → roles
is_active       BOOLEAN DEFAULT true
must_change_pwd BOOLEAN DEFAULT true   -- true tras seed/reset
last_login_at   TIMESTAMPTZ
failed_attempts INTEGER DEFAULT 0
locked_until    TIMESTAMPTZ
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `roles`

```
id          UUID PK
name        TEXT UNIQUE NOT NULL   -- ADMIN | RRHH | ENCARGADO | COCINA
description TEXT
created_at  TIMESTAMPTZ
```

### `permissions`

```
id      UUID PK
action  TEXT NOT NULL   -- p.ej. hr:employees:read, menu:edit
```

### `role_permissions`

```
role_id       UUID FK → roles
permission_id UUID FK → permissions
PRIMARY KEY (role_id, permission_id)
```

### `audit_logs`

Registro inmutable de eventos. No se modifica ni elimina.

```
id          UUID PK
actor_id    UUID FK → users (nullable si acción de sistema)
action      TEXT NOT NULL        -- constante de evento, p.ej. USER_LOGIN
target_type TEXT                 -- p.ej. 'employee', 'document'
target_id   UUID                 -- ID del recurso afectado
metadata    JSONB                -- contexto sin datos sensibles
ip_address  INET
created_at  TIMESTAMPTZ NOT NULL
```

> **Qué NO va en metadata:** contraseñas, cookies, contenido de documentos, DNI/NIE, NAF.

### `app_settings`

Configuración dinámica de la empresa, editable sin redesplegar.

```
key         TEXT PK              -- p.ej. 'company.name', 'company.cif'
value       TEXT NOT NULL
updated_by  UUID FK → users
updated_at  TIMESTAMPTZ
```

### `stored_files`

Registro de todos los archivos subidos. El contenido físico lo gestiona `StorageProvider`.

```
id              UUID PK
storage_key     TEXT UNIQUE NOT NULL  -- ruta opaca interna, nunca DNI/nombre
original_name   TEXT                  -- nombre original del archivo
mime_type       TEXT
size_bytes      INTEGER
sha256          TEXT NOT NULL         -- para integridad y detección de duplicados
uploaded_by     UUID FK → users
deleted_at      TIMESTAMPTZ           -- soft delete
created_at      TIMESTAMPTZ
```

---

## Módulo RRHH

### `employees`

```
id                  UUID PK
-- Campos de identificación (cifrados a nivel de aplicación)
first_name          TEXT NOT NULL
last_name           TEXT NOT NULL
id_number_enc       BYTEA              -- DNI/NIE cifrado
id_number_hash      TEXT               -- hash ciego para búsqueda exacta
social_security_enc BYTEA              -- NAF cifrado
-- Contacto
phone_enc           BYTEA              -- teléfono cifrado
email               TEXT
address             TEXT
emergency_contact   TEXT
-- Estado
status              TEXT NOT NULL      -- active | inactive | leave
hire_date           DATE NOT NULL
notes               TEXT
-- Metadatos
created_by          UUID FK → users
updated_by          UUID FK → users
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

> El cifrado de campos sensibles y la estrategia de búsqueda se detallan en `SECURITY.md`.

### `contracts`

Historial de contratos. Cada versión es una fila nueva; no se modifica la anterior.

```
id              UUID PK
employee_id     UUID FK → employees NOT NULL
version         INTEGER NOT NULL
contract_type   TEXT NOT NULL       -- indefinido | temporal | formación | etc.
start_date      DATE NOT NULL
end_date        DATE                -- null = indefinido
weekly_hours    NUMERIC(5,2) NOT NULL
monthly_hours   NUMERIC(7,2)        -- nullable; se usa si difiere de weekly*4.33
is_full_time    BOOLEAN NOT NULL
notes           TEXT
created_by      UUID FK → users
created_at      TIMESTAMPTZ
-- No tiene updated_at; es inmutable una vez creado
UNIQUE (employee_id, version)
```

### `schedules`

Horario habitual versionado. Cada cambio produce una fila nueva.

```
id              UUID PK
employee_id     UUID FK → employees NOT NULL
version         INTEGER NOT NULL
effective_from  DATE NOT NULL
notes           TEXT
created_by      UUID FK → users
created_at      TIMESTAMPTZ
UNIQUE (employee_id, version)
```

### `schedule_days`

Tramos de cada día del horario habitual.

```
id              UUID PK
schedule_id     UUID FK → schedules NOT NULL
day_of_week     SMALLINT NOT NULL   -- 1=lunes … 7=domingo (ISO 8601)
is_rest_day     BOOLEAN NOT NULL DEFAULT false
-- Tramo mañana
morning_start   TIME WITH TIME ZONE
morning_end     TIME WITH TIME ZONE
-- Tramo tarde
afternoon_start TIME WITH TIME ZONE
afternoon_end   TIME WITH TIME ZONE
-- Un tramo puede cruzar medianoche (end < start)
```

### `time_records`

Registro mensual de jornada. Cada fila es un mes de un empleado.

```
id              UUID PK
employee_id     UUID FK → employees NOT NULL
year            SMALLINT NOT NULL
month           SMALLINT NOT NULL   -- 1-12
status          TEXT NOT NULL       -- draft | closed
closed_at       TIMESTAMPTZ
closed_by       UUID FK → users
reopened_at     TIMESTAMPTZ
reopened_by     UUID FK → users
reopen_reason   TEXT                -- obligatorio al reabrir
-- Snapshot del contrato vigente en el momento de crear el borrador
contract_snapshot JSONB NOT NULL
-- Snapshot del horario vigente
schedule_snapshot JSONB NOT NULL
created_by      UUID FK → users
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
UNIQUE (employee_id, year, month)
```

### `time_record_days`

Una fila por día del mes en el registro.

```
id                  UUID PK
time_record_id      UUID FK → time_records NOT NULL
date                DATE NOT NULL
day_type            TEXT NOT NULL   -- work | rest | holiday | absence | vacation | sick_leave
-- Tramo mañana
morning_start       TIME WITH TIME ZONE
morning_end         TIME WITH TIME ZONE
-- Tramo tarde
afternoon_start     TIME WITH TIME ZONE
afternoon_end       TIME WITH TIME ZONE
-- Calculados (revisables manualmente)
total_minutes       INTEGER         -- duración total calculada
ordinary_minutes    INTEGER         -- revisable
overtime_minutes    INTEGER         -- revisable
observation         TEXT
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
UNIQUE (time_record_id, date)
```

> Los minutos se calculan en el servidor con lógica entera. Los campos `ordinary_minutes` y `overtime_minutes` son revisables: el sistema propone, el usuario confirma. La app no decide automáticamente qué es hora extra.

### `time_record_pdfs`

Versiones del PDF generado para un registro mensual.

```
id              UUID PK
time_record_id  UUID FK → time_records NOT NULL
version         INTEGER NOT NULL
file_id         UUID FK → stored_files NOT NULL
generated_by    UUID FK → users
generated_at    TIMESTAMPTZ
is_current      BOOLEAN NOT NULL DEFAULT true
-- Solo un PDF puede ser current por registro
```

### `employee_documents`

Archivo documental de RRHH.

```
id              UUID PK
employee_id     UUID FK → employees NOT NULL
file_id         UUID FK → stored_files NOT NULL
category        TEXT NOT NULL   -- contract | id_doc | social_security | payslip |
                                -- signed_payslip | severance | sick_leave |
                                -- sick_leave_end | vacation | communication | other
title           TEXT NOT NULL
document_date   DATE
ref_year        SMALLINT
ref_month       SMALLINT        -- 1-12, nullable
notes           TEXT
version         INTEGER NOT NULL DEFAULT 1
status          TEXT NOT NULL DEFAULT 'pending'  -- pending | signed
is_deleted      BOOLEAN NOT NULL DEFAULT false
deleted_at      TIMESTAMPTZ
deleted_by      UUID FK → users
created_by      UUID FK → users
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

---

## Módulo Menú

### `dishes`

Catálogo de platos.

```
id          UUID PK
name        TEXT NOT NULL
category    TEXT NOT NULL    -- first | second | other
is_active   BOOLEAN NOT NULL DEFAULT true
allergens   TEXT[]           -- array de alérgenos (texto libre normalizado)
use_count   INTEGER DEFAULT 0   -- para autocompletado por frecuencia
created_by  UUID FK → users
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

### `daily_menus`

Menú de un día concreto.

```
id          UUID PK
date        DATE UNIQUE NOT NULL   -- solo un menú activo por fecha
price_cents INTEGER NOT NULL        -- precio en céntimos
notes       TEXT
status      TEXT NOT NULL DEFAULT 'draft'  -- draft | published
created_by  UUID FK → users
updated_by  UUID FK → users
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

### `daily_menu_dishes`

Platos de un menú, con orden y categoría.

```
id              UUID PK
daily_menu_id   UUID FK → daily_menus NOT NULL
dish_id         UUID FK → dishes NOT NULL
category        TEXT NOT NULL   -- first | second | other
sort_order      SMALLINT NOT NULL
```

### `menu_pdfs`

PDFs generados para un menú.

```
id              UUID PK
daily_menu_id   UUID FK → daily_menus NOT NULL
pdf_type        TEXT NOT NULL    -- combined | firsts | seconds | kitchen
version         INTEGER NOT NULL
file_id         UUID FK → stored_files NOT NULL
is_current      BOOLEAN NOT NULL DEFAULT true
generated_by    UUID FK → users
generated_at    TIMESTAMPTZ
```

---

## Módulo Proveedores/Facturas (futuro — interfaz preparada)

Se crearán en Fase 7. Se documenta la interfaz OCR aquí para que la BD no necesite cambios estructurales al llegar.

### Estado de extracción OCR

```
NOT_REQUESTED → QUEUED → PROCESSING → NEEDS_REVIEW → CONFIRMED
                                    ↘ FAILED
```

Las tablas `suppliers` e `invoices` se definirán en Fase 7A. El campo `extraction_status` de `invoices` usará los valores anteriores.

---

## Relaciones clave (resumen)

```
users ──────────────────────── roles
                                 │
                            role_permissions
                                 │
                            permissions

employees ──┬──── contracts (historial)
            ├──── schedules (historial)
            │       └── schedule_days
            ├──── time_records
            │       └── time_record_days
            │       └── time_record_pdfs ── stored_files
            └──── employee_documents ────── stored_files

daily_menus ─── daily_menu_dishes ── dishes
            └── menu_pdfs ────────── stored_files

audit_logs → users (actor)
           → any resource (target_type + target_id)

app_settings → users (updated_by)
```

---

## Migraciones

- Se usarán migraciones Prisma nombradas (`prisma migrate dev --name <descripción>`).
- Cada migración irá en su propio commit. Nunca modificar una migración ya aplicada en producción.
- El seed de desarrollo usará únicamente datos ficticios: personas, DNI/NIE, NAF y nóminas inventados.

## Decisiones pendientes

| Pregunta | Impacto |
|----------|---------|
| ¿Cifrar también `email` y `address`? | Requiere decidir búsqueda por email | 
| ¿UUID v4 o ULID para IDs? | ULIDs ofrecen orden cronológico, evaluar en Fase 1 |
| ¿`schedule_days` usa `TIME WITH TIME ZONE` o minutos enteros desde medianoche? | Evaluar en Fase 2A |
| Formato exacto de `contract_snapshot` y `schedule_snapshot` en JSONB | Definir en Fase 2B antes de escribir la migración |
