# Seguridad — Cruz Blanca Gestión

> Este documento registra las decisiones de seguridad del sistema. Se actualiza en cada fase. Ninguna regla de este documento debe relajarse sin justificación escrita aquí.

## Principios generales

1. **Autorización siempre en el servidor.** El middleware y los Server Actions comprueban sesión y permiso antes de cualquier operación. Ocultar botones en la UI es cosmético, no seguridad.
2. **Mínimo privilegio.** Cada rol tiene solo los permisos estrictamente necesarios para su función.
3. **Defensa en profundidad.** Varias capas de protección; ninguna capa única es suficiente.
4. **Privacidad por diseño.** Los campos de datos personales se cifran a nivel de aplicación. Los logs no contienen datos sensibles.
5. **Datos que sobreviven a los contenedores.** La clave de cifrado viene del entorno (`.env`), no está en el código.

---

## Autenticación

### Mecanismo

- Auth.js (NextAuth v5) con proveedor **Credentials**.
- Contraseñas almacenadas con **Argon2id** (no bcrypt). Parámetros mínimos: memoria 64 MB, iteraciones 3, paralelismo 1.
- La primera cuenta de administrador se crea con un comando de seed explícito y tiene `must_change_pwd = true`. El usuario no puede acceder a ninguna función hasta cambiar la contraseña provisional.

### Sesiones

- Sesiones JWT firmadas con secreto del entorno (`AUTH_SECRET`, mínimo 32 bytes aleatorios).
- Cookie `httpOnly`, `sameSite: lax`, `secure: true` en producción.
- Duración de sesión: 8 horas (configurable). Renovación automática en actividad.
- No almacenar datos sensibles en el payload del JWT.

### Protección ante fuerza bruta

- Máximo 5 intentos de login fallidos consecutivos desde la misma cuenta.
- Tras 5 intentos: bloqueo de la cuenta por 15 minutos (campo `locked_until` en `users`).
- El contador se reinicia tras un login exitoso.
- No revelar en el mensaje de error si el usuario existe o si la contraseña es incorrecta ("Credenciales incorrectas").

### Cambio de contraseña

- Requiere introducir la contraseña actual.
- La nueva contraseña debe tener al menos 12 caracteres.
- No hay recuperación de contraseña por email (sistema sin SMTP en MVP). El administrador puede generar una contraseña provisional que obliga a cambio.

---

## Autorización (RBAC)

### Roles iniciales

| Rol | Descripción |
|-----|-------------|
| `ADMIN` | Acceso total. Gestiona usuarios, roles y configuración. |
| `RRHH` | Acceso completo al módulo RRHH (empleados, contratos, documentos). Sin acceso a gestión de usuarios. |
| `ENCARGADO` | Acceso a menús (editar/generar). Acceso limitado a RRHH (definir exactamente antes de Fase 1). Sin acceso a datos salariales ni documentos laborales. |
| `COCINA` | Solo puede ver e imprimir el menú del día vigente. Sin acceso a ningún módulo de RRHH. |

### Mapa de permisos (a completar en Fase 1)

```
Permiso                      ADMIN  RRHH  ENCARGADO  COCINA
─────────────────────────────────────────────────────────────
users:manage                   ✓
hr:employees:read              ✓      ✓      ?
hr:employees:write             ✓      ✓
hr:contracts:read              ✓      ✓
hr:contracts:write             ✓      ✓
hr:time_records:read           ✓      ✓      ?
hr:time_records:write          ✓      ✓
hr:documents:read              ✓      ✓
hr:documents:write             ✓      ✓
menu:read                      ✓      ✓      ✓          ✓
menu:write                     ✓      ✓      ✓
menu:pdf:generate              ✓      ✓      ✓
admin:settings                 ✓
admin:audit_log                ✓
```

> Las celdas `?` para ENCARGADO deben resolverse antes de implementar la Fase 1. La decisión se registrará aquí.

### Comprobación de permisos

```typescript
// Patrón obligatorio en Server Actions y Route Handlers:
const session = await getServerSession();
if (!session) redirect('/login');
if (!hasPermission(session.user.role, 'hr:employees:read')) {
  throw new ForbiddenError();
}
```

---

## Cifrado de datos personales

### Campos cifrados a nivel de aplicación

Los siguientes campos se cifran antes de almacenarse en la BD:

| Tabla | Campo | Razón |
|-------|-------|-------|
| `employees` | `id_number_enc` | DNI/NIE — dato especialmente protegido |
| `employees` | `social_security_enc` | NAF — dato especialmente protegido |
| `employees` | `phone_enc` | Teléfono personal |

El cifrado usa **AES-256-GCM** con:
- Clave derivada de `FIELD_ENCRYPTION_KEY` (variable de entorno, 32 bytes en hex).
- IV aleatorio de 12 bytes por cada cifrado (nunca reutilizar IV).
- Tag de autenticación incluido en el campo cifrado.

Formato almacenado: `<iv_hex>:<tag_hex>:<ciphertext_hex>` (texto) o BYTEA.

### Hash ciego para búsquedas

Los campos `id_number_hash` almacenan `HMAC-SHA256(valor_normalizado, SEARCH_HMAC_KEY)` para permitir búsqueda exacta sin descifrar todos los registros.

- `SEARCH_HMAC_KEY` es una clave separada de `FIELD_ENCRYPTION_KEY`.
- Normalización antes del hash: mayúsculas, sin espacios ni guiones.
- Solo sirve para búsqueda exacta; no permite búsqueda parcial ni listado.

### Gestión de claves

- Las claves (`FIELD_ENCRYPTION_KEY`, `SEARCH_HMAC_KEY`) viven únicamente en `.env` (nunca en el repositorio).
- Si hay que rotar una clave, se ejecuta un script de re-cifrado que descifra con la clave antigua y vuelve a cifrar con la nueva. El script se documenta en el momento de implementación.
- Backup de claves: guardar una copia cifrada de `.env` en un lugar distinto al del servidor (no en el mismo PC).

---

## Protección de documentos

- Los archivos se almacenan en el volumen Docker con **nombres opacos** (UUID o hash), nunca con el nombre original ni el DNI del empleado.
- Toda descarga pasa por el endpoint `/api/files/[id]`:
  1. Verificar sesión válida.
  2. Verificar que el usuario tiene permiso para el tipo de documento.
  3. Verificar que el documento no está eliminado.
  4. Registrar el acceso en `audit_logs`.
  5. Hacer stream del archivo.
- No existen URLs de descarga directa que no requieran sesión.
- Los archivos en el volumen Docker no son accesibles desde el exterior sin pasar por la app.

---

## Protección contra ataques web comunes

### Cabeceras HTTP de seguridad (Next.js `next.config`)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<nonce>'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
```

> El CSP exacto se definirá en Fase 1 según los recursos que cargue la app.

### CSRF

Auth.js v5 incluye protección CSRF en sus endpoints. Los Server Actions de Next.js tienen protección integrada mediante same-origin checks.

### SQL Injection

Prisma ORM usa consultas parametrizadas. No se construirán consultas SQL con concatenación de strings.

### XSS

React escapa el contenido por defecto. No usar `dangerouslySetInnerHTML` salvo casos muy controlados y documentados.

### Subida de archivos

- Validar extensión y MIME type real (magic bytes), no solo el nombre.
- Tamaño máximo configurable (`MAX_UPLOAD_SIZE_MB` en `.env`, default 20 MB).
- Nombre de archivo saneado o descartado; el sistema usa su propio identificador opaco.
- Almacenar fuera del directorio público de Next.js.

---

## Logging y auditoría

### Qué se registra en `audit_logs`

| Evento | Quién puede verlo |
|--------|------------------|
| `USER_LOGIN` / `USER_LOGIN_FAILED` | ADMIN |
| `USER_LOGOUT` | ADMIN |
| `USER_CREATED` / `USER_UPDATED` / `USER_DEACTIVATED` | ADMIN |
| `EMPLOYEE_CREATED` / `EMPLOYEE_UPDATED` / `EMPLOYEE_ARCHIVED` | ADMIN, RRHH |
| `CONTRACT_CREATED` | ADMIN, RRHH |
| `TIME_RECORD_CREATED` / `CLOSED` / `REOPENED` | ADMIN, RRHH |
| `DOCUMENT_UPLOADED` / `DOWNLOADED` / `DELETED` | ADMIN, RRHH |
| `PASSWORD_CHANGED` | ADMIN |

### Qué NO se registra nunca

- Contraseñas (ni en claro ni como hash).
- Cookies o tokens de sesión.
- DNI/NIE, NAF (ni cifrado ni en claro).
- Contenido de documentos (el nombre de archivo opaco sí puede registrarse).
- IBAN u otros datos financieros.

### Formato de log de aplicación (stdout/stderr del contenedor)

Formato JSON estructurado, nivel configurado con `LOG_LEVEL`. El colector de logs del host (Windows Event Log o archivo) no debe incluir los campos prohibidos arriba.

---

## Variables de entorno críticas

El archivo `.env.example` documenta todas las variables. Las variables marcadas **SECRET** nunca deben compartirse ni subirse al repositorio.

| Variable | Descripción | SECRET |
|----------|-------------|--------|
| `DATABASE_URL` | URL de conexión PostgreSQL | ✓ |
| `AUTH_SECRET` | Clave de firma JWT Auth.js (min 32 bytes hex) | ✓ |
| `FIELD_ENCRYPTION_KEY` | Clave AES-256 para cifrado de campos (32 bytes hex) | ✓ |
| `SEARCH_HMAC_KEY` | Clave HMAC para hashes de búsqueda (32 bytes hex) | ✓ |
| `NEXTAUTH_URL` | URL base de la app (para cookies y redirects) | |
| `MAX_UPLOAD_SIZE_MB` | Tamaño máximo de upload | |
| `LOG_LEVEL` | Nivel de log (info/warn/error) | |
| `NODE_ENV` | production/development | |
| `TZ` | Europe/Madrid | |

---

## Actualizaciones de dependencias

- Revisar dependencias con vulnerabilidades conocidas al inicio de cada fase (`npm audit`).
- No bloquear el desarrollo por avisos de severidad baja/media, pero registrar y resolver en la siguiente fase.
- Severidad alta/crítica en dependencias directas: no avanzar hasta resolver.

---

## Decisiones de seguridad pendientes

| Pregunta | Necesaria en |
|----------|-------------|
| ¿Cifrar también `email` y `address` del empleado? | Fase 2A |
| Permisos exactos de ENCARGADO | Fase 1 |
| ¿Rate limiting global o solo en login? | Fase 1 |
| ¿Autenticación de dos factores en el futuro? | Post-MVP |
| ¿Audit log de consultas de listado (además de descargas)? | Fase 2C |
