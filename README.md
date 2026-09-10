# Cruz Blanca Gestión

Sistema de gestión interna para restaurante. Aplicación web modular autohospedada en el PC del restaurante, accesible en la red local y desde el exterior mediante Tailscale (sin abrir puertos del router).

## Estado actual

**Fase 0 completada** — Documentación de arquitectura y planificación.  
**Siguiente paso:** Fase 1 — Núcleo ejecutable (auth, Docker, base de datos, layout).

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js (App Router) + TypeScript estricto |
| UI | React + Tailwind CSS + shadcn/ui |
| Base de datos | PostgreSQL + Prisma ORM |
| Autenticación | Auth.js con credenciales locales + Argon2id |
| Validación | Zod (compartido cliente/servidor) |
| PDFs | Solución server-side compatible con Docker (puppeteer-core o @react-pdf/renderer) |
| Infraestructura | Docker Compose |
| Almacenamiento docs | Volumen Docker local detrás de interfaz `StorageProvider` |
| Tests | Vitest (unitarios/integración) + Playwright (flujos E2E) |
| Acceso remoto | Tailscale (opción principal) / Cloudflare Tunnel (alternativa) |

## Módulos planificados

```
✅ Fase 0  Arquitectura y documentación
⬜ Fase 1  Núcleo: auth, usuarios, roles, auditoría, layout
⬜ Fase 2A RRHH: empleados, contratos, horarios
⬜ Fase 2B RRHH: registro mensual de jornada + PDF
⬜ Fase 2C RRHH: archivo documental
⬜ Fase 3  Menú del día + 3 PDFs (carta cliente, cocina)
⬜ Fase 4  Instalación Windows, backups, acceso remoto
⬜ Fase 7A Proveedores y facturas (sin OCR)
⬜ Fase 7B OCR de facturas (proveedor intercambiable)
```

## Arranque rápido (cuando exista código)

```bash
# 1. Copiar variables de entorno
cp .env.example .env
# Editar .env con valores reales (nunca compartir este archivo)

# 2. Levantar contenedores
docker compose up -d

# 3. Ejecutar migraciones y seed inicial
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run seed:dev

# 4. Abrir en el navegador
# http://localhost:3000  (red local)
# http://<ip-local>:3000 (desde otro PC de la red)
```

## Estructura del repositorio

```
cruz-blanca-gestion/
├── src/
│   ├── app/                  # Next.js App Router (rutas, layouts, páginas)
│   ├── modules/              # Módulos de negocio aislados
│   │   ├── hr/               # RRHH
│   │   ├── menu/             # Menú del día
│   │   ├── suppliers/        # Proveedores y facturas (futuro)
│   │   └── appcc/            # APPCC (futuro)
│   ├── core/                 # Núcleo compartido
│   │   ├── auth/             # Auth.js config, sesiones, middleware
│   │   ├── db/               # Cliente Prisma, helpers de transacción
│   │   ├── storage/          # StorageProvider interface + implementación local
│   │   ├── audit/            # Servicio de auditoría
│   │   ├── pdf/              # Utilidades de generación de PDF
│   │   └── config/           # AppSettings, variables de entorno tipadas
│   ├── components/           # Componentes UI reutilizables
│   └── lib/                  # Utilidades genéricas (fechas, dinero, etc.)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/                     # Documentación del proyecto
├── tests/
│   ├── unit/                 # Vitest
│   └── e2e/                  # Playwright
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── PROJECT_STATUS.md
```

## Convenciones importantes

- **UI en español**, código/tablas/variables en inglés.
- Zona horaria **Europe/Madrid**. Fechas almacenadas como UTC en la BD; mostradas en Madrid.
- Dinero en **céntimos enteros** (integer). Nunca float para importes.
- Documentos accesibles únicamente con sesión válida y permiso comprobado en servidor.
- No registrar en logs: contraseñas, cookies, DNI/NIE, NAF, contenido documental.
- Datos y documentos deben sobrevivir a reconstrucciones de contenedores.

## Documentación adicional

- [Arquitectura](docs/ARCHITECTURE.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Seguridad](docs/SECURITY.md)
- [Backup y restauración](docs/BACKUP_RESTORE.md)
- [Estado del proyecto](PROJECT_STATUS.md)

---

> **Aviso legal:** Esta aplicación genera documentos administrativos editables.  
> No sustituye asesoramiento laboral, fiscal ni legal profesional.
