# Copia de seguridad y restauración — Cruz Blanca Gestión

> Este documento describe la política de copias de seguridad, los procedimientos de backup y restauración, y la estrategia de rotación. Se actualiza en Fase 4 con scripts ejecutables y rutas definitivas.

## Qué hay que proteger

| Dato | Ubicación | Criticidad |
|------|-----------|-----------|
| Base de datos PostgreSQL | Volumen Docker `pgdata` → ruta configurable en disco de datos | Alta |
| Documentos subidos (PDFs, contratos, nóminas…) | Volumen Docker `documents` → ruta configurable | Alta |
| Variables de entorno y claves de cifrado | Archivo `.env` en el PC | Muy alta |
| Código de la aplicación | Repositorio Git (local + copia externa) | Media |

> **Las claves de cifrado (`.env`) deben guardarse en un lugar separado y cifrado, diferente al del servidor. Sin ellas, los datos cifrados de empleados son irrecuperables.**

---

## Política 3-2-1

| Copia | Destino | Formato |
|-------|---------|---------|
| 1 | Mismo PC, disco de datos (distinto del sistema) | pg_dump + tar de documentos |
| 2 | Disco externo USB en el restaurante | Copia del backup local |
| 3 | Destino externo cifrado (Backblaze B2, MEGA o similar) | Backup cifrado con gpg/age |

> La copia nº 3 no se configurará sin autorización y credenciales del propietario del restaurante. En el MVP solo se implementan las copias 1 y 2; la nº 3 se documenta como procedimiento manual hasta que el propietario decida el destino.

---

## Frecuencia recomendada

| Copia | Frecuencia | Retención |
|-------|-----------|-----------|
| Local automática | Diaria (madrugada) | 14 días |
| Disco externo | Semanal (manual o automática) | 4 semanas |
| Destino externo | Semanal | 3 meses |

---

## Estructura de un backup

```
backup_YYYYMMDD_HHMMSS/
├── manifest.json          # metadatos: fecha, versión app, hashes de archivos
├── db/
│   └── dump.sql.gz        # pg_dump --format=plain comprimido
└── documents/
    └── documents.tar.gz   # tar del directorio de documentos
```

El manifest incluye los SHA-256 de `dump.sql.gz` y `documents.tar.gz` para verificar integridad.

---

## Procedimiento de backup (script — implementación en Fase 4)

El script `scripts/backup.sh` (o `.ps1` en Windows) realizará:

```bash
# Pseudocódigo — implementación real en Fase 4
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/backup_$TIMESTAMP"

# 1. Dump PostgreSQL dentro del contenedor
docker compose exec -T db pg_dump \
  --username=$POSTGRES_USER \
  --dbname=$POSTGRES_DB \
  | gzip > "$BACKUP_DIR/db/dump.sql.gz"

# 2. Tar del directorio de documentos
tar -czf "$BACKUP_DIR/documents/documents.tar.gz" \
  -C "$DOCUMENTS_ROOT" .

# 3. Generar manifest con hashes
sha256sum "$BACKUP_DIR/db/dump.sql.gz" \
          "$BACKUP_DIR/documents/documents.tar.gz" \
  > "$BACKUP_DIR/manifest.json"

# 4. Rotación: eliminar backups más antiguos de $RETENTION_DAYS días
find "$BACKUP_ROOT" -maxdepth 1 -name "backup_*" \
  -mtime +$RETENTION_DAYS -exec rm -rf {} \;

# El script NO incluye en logs la URL de BD ni contraseñas
```

Variables de entorno necesarias para el script:
```
BACKUP_ROOT=D:/CruzBlancaBackups
DOCUMENTS_ROOT=D:/CruzBlancaDatos/documents
RETENTION_DAYS=14
POSTGRES_USER=...
POSTGRES_DB=...
```

---

## Procedimiento de restauración

> **Un backup no se considera válido hasta que se ha ensayado la restauración en un entorno de prueba.**

### Pasos de restauración

```bash
# 1. Verificar integridad del backup
sha256sum --check backup_YYYYMMDD_HHMMSS/manifest.json

# 2. Detener la aplicación
docker compose stop app

# 3. Restaurar la base de datos
# ATENCIÓN: esto sobreescribe la BD existente
docker compose exec -T db psql \
  --username=$POSTGRES_USER \
  --dbname=$POSTGRES_DB \
  < <(gunzip -c backup_YYYYMMDD_HHMMSS/db/dump.sql.gz)

# 4. Restaurar documentos
tar -xzf backup_YYYYMMDD_HHMMSS/documents/documents.tar.gz \
  -C $DOCUMENTS_ROOT

# 5. Arrancar la aplicación
docker compose start app

# 6. Verificar que la app arranca y los datos son accesibles
# Abrir http://localhost:3000 y comprobar un registro de empleado
```

### Restauración en entorno de prueba

Para validar backups sin afectar producción:

```bash
# Levantar un segundo docker-compose con puertos diferentes
# y volúmenes en rutas de prueba (p.ej. D:/CruzBlancaTest/)
# Apuntar a un archivo .env.test con NEXTAUTH_URL y DATABASE_URL distintos
docker compose -f docker-compose.test.yml up -d

# Restaurar el backup en ese entorno de prueba
# Verificar que los datos ficticios del backup son accesibles
# Anotar la fecha de verificación en PROJECT_STATUS.md
```

---

## Runbook de actualización de la aplicación

```bash
# 1. Hacer un backup manual antes de cualquier actualización
./scripts/backup.sh

# 2. Descargar la nueva versión del repositorio
git pull origin main   # o copiar los archivos manualmente

# 3. Reconstruir los contenedores (no elimina los volúmenes)
docker compose build
docker compose up -d

# 4. Aplicar migraciones de BD si las hay
docker compose exec app npx prisma migrate deploy

# 5. Verificar que la app arranca correctamente
# Comprobar http://localhost:3000/api/health

# 6. Si algo falla: rollback
git checkout <versión anterior>   # o restaurar imagen anterior
docker compose up -d
# Si la migración causó el fallo, restaurar el backup
```

---

## Runbook de rollback de emergencia

```bash
# 1. Detener app
docker compose stop app

# 2. Identificar el backup válido más reciente
ls -la $BACKUP_ROOT/

# 3. Verificar integridad
sha256sum --check $BACKUP_ROOT/backup_YYYYMMDD_HHMMSS/manifest.json

# 4. Restaurar (ver sección de restauración arriba)

# 5. Volver a la versión anterior del código
git checkout <tag o commit anterior>
docker compose build app
docker compose start app
```

---

## Dónde están físicamente los datos

Esta sección se rellenará con las rutas definitivas al final de la Fase 4. Plantilla:

```
Base de datos PostgreSQL:    [PENDIENTE — p.ej. D:\CruzBlancaDatos\postgres]
Documentos subidos:          [PENDIENTE — p.ej. D:\CruzBlancaDatos\documents]
Backups locales automáticos: [PENDIENTE — p.ej. D:\CruzBlancaBackups]
Disco externo de backup:     [PENDIENTE — p.ej. E:\Backup Cruz Blanca]
Destino externo cifrado:     [PENDIENTE — decisión del propietario]
Archivo .env (claves):       Solo en el PC del restaurante, nunca en el repositorio
Copia de .env:               [PENDIENTE — decisión del propietario]
```

---

## Política de retención de datos personales

> Esta sección describe recomendaciones. El propietario decide y es responsable de cumplir la normativa aplicable (RGPD, ET, etc.).

- Los registros de jornada y documentos laborales deben conservarse el tiempo que exija la normativa laboral y fiscal vigente (consultar con asesoría).
- Los archivos en papelera (soft delete) se conservan hasta que un administrador los purga explícitamente. La purga queda registrada en `audit_logs`.
- Los backups pueden contener datos ya eliminados de la aplicación. La política de borrado definitivo de backups debe coordinarse con la política de retención.

---

## Acceso remoto y seguridad del backup

- Los backups locales se almacenan en el mismo PC. Si el PC se daña físicamente, el backup local también se pierde.
- El disco externo debe retirarse del PC tras cada copia (no dejar siempre conectado).
- El destino externo (copia 3) debe estar cifrado; nunca subir datos de empleados a la nube sin cifrado.
- El acceso al PC del restaurante mediante Tailscale no da acceso a los archivos de backup por defecto; el acceso es solo a la aplicación web.

---

## Decisiones pendientes

| Pregunta | Necesaria en |
|----------|-------------|
| Ruta definitiva del disco de datos | Fase 4 |
| Destino de la copia externa (Backblaze, MEGA, NAS…) | Fase 4 / decisión propietario |
| Frecuencia real de copia al disco externo | Fase 4 |
| ¿Automatizar la copia al disco externo con Windows Task Scheduler? | Fase 4 |
| ¿Cifrar los backups locales también o solo el externo? | Fase 4 |
