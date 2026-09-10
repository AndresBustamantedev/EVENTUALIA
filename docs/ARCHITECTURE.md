# Arquitectura — Cruz Blanca Gestión

## Visión general

Monolito modular Next.js autohospedado en un PC Windows del restaurante. El objetivo es que una sola persona no técnica pueda operar el sistema con instrucciones claras, y que un desarrollador pueda añadir módulos sin reescribir el núcleo.

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE (navegador)                       │
│           React + Tailwind CSS + shadcn/ui                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (local / Tailscale)
┌──────────────────────────▼──────────────────────────────────┐
│               NEXT.JS APP ROUTER (contenedor Docker)        │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  app/       │  │  src/modules │  │  src/core/         │  │
│  │  (rutas,    │  │  hr/         │  │  auth/             │  │
│  │   layouts,  │  │  menu/       │  │  db/               │  │
│  │   páginas)  │  │  suppliers/  │  │  storage/          │  │
│  │             │  │  appcc/...   │  │  audit/            │  │
│  └─────────────┘  └──────────────┘  │  pdf/              │  │
│                                      │  config/           │  │
│                                      └────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              PostgreSQL (contenedor Docker)                  │
│              Volumen persistente en disco de datos           │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Volumen de documentos (disco de datos)         │
│              Gestionado por StorageProvider                  │
└─────────────────────────────────────────────────────────────┘
```

## Principios de diseño

### 1. Monolito modular

Un único proceso Next.js. Los módulos viven en `src/modules/<nombre>/` y están aislados entre sí: no se llaman directamente, solo comparten los servicios del núcleo (`src/core/`). Esto permite añadir o quitar módulos sin afectar a otros.

### 2. Server-first

La autorización, la lógica de negocio y el acceso a datos residen en el servidor (Server Actions, Route Handlers). El cliente recibe solo lo que necesita mostrar. Nunca confiar en ocultar botones como único control de acceso.

### 3. Interfaces intercambiables en el núcleo

- `StorageProvider` — abstrae el almacenamiento de archivos. Implementación inicial: sistema de ficheros local. Interfaz preparada para migrar a S3-compatible sin tocar el código de los módulos.
- `OcrProvider` — abstrae la extracción de facturas (futuro). Implementación inicial: `NullOcrProvider` (no hace nada). Permite enchufar servicios locales o en la nube sin reescribir el módulo de facturas.

### 4. Datos que sobreviven a los contenedores

PostgreSQL y los documentos se almacenan en volúmenes Docker vinculados a rutas del disco de datos del PC. Reconstruir o actualizar los contenedores no elimina ningún dato.

## Estructura de directorios

```
src/
├── app/
│   ├── (auth)/              # Rutas públicas: login
│   ├── (dashboard)/         # Rutas protegidas por middleware
│   │   ├── layout.tsx       # Layout con navegación modular
│   │   ├── page.tsx         # Dashboard principal
│   │   ├── hr/              # Rutas del módulo RRHH
│   │   ├── menu/            # Rutas del módulo Menú
│   │   ├── suppliers/       # Rutas del módulo Proveedores (futuro)
│   │   └── admin/           # Rutas de administración
│   └── api/
│       ├── auth/            # Auth.js handlers
│       ├── health/          # Endpoint de salud (sin secretos)
│       └── files/           # Descarga segura de documentos
│
├── modules/
│   ├── hr/
│   │   ├── components/      # Componentes React específicos de RRHH
│   │   ├── actions/         # Server Actions de RRHH
│   │   ├── queries/         # Consultas a BD (Prisma)
│   │   ├── schemas/         # Esquemas Zod
│   │   ├── pdf/             # Plantillas PDF de jornada
│   │   └── types.ts
│   ├── menu/
│   │   ├── components/
│   │   ├── actions/
│   │   ├── queries/
│   │   ├── schemas/
│   │   ├── pdf/             # Plantillas PDF de menú (3 documentos)
│   │   └── types.ts
│   └── suppliers/           # Preparado; no implementado en MVP
│       └── ocr/
│           └── OcrProvider.ts   # Interfaz + NullOcrProvider
│
└── core/
    ├── auth/
    │   ├── config.ts        # Auth.js configuration
    │   ├── middleware.ts     # Next.js middleware (protección de rutas)
    │   ├── permissions.ts   # Mapa rol → acciones permitidas
    │   └── session.ts       # Helper para obtener sesión en Server Components
    ├── db/
    │   ├── client.ts        # Singleton PrismaClient
    │   └── helpers.ts       # withTransaction, softDelete, etc.
    ├── storage/
    │   ├── StorageProvider.ts   # Interfaz
    │   ├── LocalStorage.ts      # Implementación sistema de ficheros
    │   └── index.ts             # Exporta la instancia activa
    ├── audit/
    │   ├── AuditService.ts  # log(action, actorId, targetId, meta)
    │   └── events.ts        # Constantes de eventos auditados
    ├── pdf/
    │   ├── renderer.ts      # Función genérica de renderizado a buffer
    │   └── fonts.ts         # Registro de fuentes
    └── config/
        ├── env.ts           # Variables de entorno tipadas con Zod
        └── AppSettings.ts   # Configuración dinámica de la BD
```

## Módulos y responsabilidades

### Core (núcleo compartido)

| Servicio | Responsabilidad |
|----------|----------------|
| `auth` | Sesiones, middleware de protección, permisos RBAC |
| `db` | Conexión Prisma, transacciones, soft delete |
| `storage` | Guardar y recuperar archivos con IDs opacos |
| `audit` | Registrar eventos sin datos sensibles |
| `pdf` | Renderizar plantillas a PDF buffer |
| `config` | Leer `.env` validado; configuración dinámica en BD |

### Módulo HR (RRHH)

- Empleados, contratos versionados, horarios versionados.
- Registro mensual de jornada (borrador → cerrado → reapertura auditada).
- Generación de PDF de jornada para imprimir y firmar.
- Archivo documental de empleados con categorías, versiones y auditoría de acceso.

### Módulo Menu (Menú del día)

- Catálogo de platos con categorías y alérgenos.
- Menú por fecha con precio en céntimos.
- Generación de 3 PDFs: primeros, segundos y cocina.

### Módulo Suppliers (Proveedores/Facturas) — futuro

- Proveedores y facturas con OCR opcional.
- `InvoiceExtractionProvider` con estados de revisión humana.

## Flujo de petición típico

```
1. Navegador → Next.js middleware
   - ¿Hay sesión válida? → sí: continuar; no: redirigir a /login

2. Server Component / Server Action
   - Obtener sesión (auth/session.ts)
   - Comprobar permiso explícito (auth/permissions.ts)
   - Ejecutar lógica de negocio (módulo correspondiente)
   - Registrar evento en AuditLog si aplica
   - Devolver datos al componente / respuesta al cliente

3. Descarga de archivo (api/files/[id])
   - Verificar sesión y permiso de acceso al archivo
   - StorageProvider.read(storedFile.storageKey)
   - Stream al cliente con cabeceras correctas
```

## Docker Compose

```
services:
  app:
    build: .
    depends_on: [db]
    restart: unless-stopped
    env_file: .env
    volumes:
      - documents:/app/data/documents
    ports:
      - "3000:3000"   # Solo escuchar en localhost si se usa Tailscale

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: D:/CruzBlancaDatos/postgres   # ruta configurable

  documents:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: D:/CruzBlancaDatos/documents  # ruta configurable
```

> Las rutas `D:/CruzBlancaDatos/...` son un ejemplo. Se configurarán mediante variables de entorno para que el operador pueda elegir el disco de datos sin tocar el compose.

## Acceso remoto

- **Fase MVP:** Red local únicamente (`http://192.168.x.x:3000`).
- **Fase operativa:** Tailscale instalado en el PC del restaurante. Cada usuario remoto se conecta a la VPN de Tailscale y accede como si estuviera en la red local.
- **Alternativa documentada:** Cloudflare Tunnel (requiere cuenta gratuita, no abre puertos del router).
- **Nunca:** abrir puertos en el router ni exponer la aplicación a Internet sin autenticación adicional.

## Generación de PDF

Se usará una biblioteca compatible con entorno Docker/headless. Las opciones evaluadas:

| Opción | Pros | Contras |
|--------|------|---------|
| `@react-pdf/renderer` | Sin navegador, ligero, JSX | Limitaciones CSS complejas |
| `puppeteer-core` + Chromium Alpine | Máxima fidelidad visual | Mayor tamaño de imagen Docker |
| `jsPDF` + `html2canvas` | Cliente-side sencillo | No adecuado para server-side seguro |

**Decisión provisional:** `@react-pdf/renderer` para el PDF de jornada (tabular, predecible). Si el PDF del menú requiere mayor fidelidad visual, se evaluará `puppeteer-core`. La decisión final se tomará en la Fase 1/2B.

## Supuestos y riesgos

| ID | Supuesto / Riesgo | Mitigación |
|----|------------------|-----------|
| A1 | El PC Windows tiene al menos 8 GB RAM y 20 GB libres en el disco de datos | Verificar en Fase 4 |
| A2 | Habrá un usuario técnico capaz de instalar Docker Desktop y ejecutar comandos | Documentación paso a paso en Fase 4 |
| A3 | Los datos ficticios de desarrollo no incluirán DNI/NIE ni NAF reales | Seed con generadores sintéticos |
| R1 | Corte de luz sin SAI puede corromper PostgreSQL | Backups automáticos + WAL; documentar procedimiento de recovery |
| R2 | El PC de restaurante puede apagarse fuera de horario de cierre | Acceso remoto (Tailscale) requiere que el PC esté encendido; documentar política |
| R3 | Cambio de normativa laboral puede requerir nuevas columnas en PDF de jornada | Plantillas parametrizadas; campos configurables |

## Decisiones pendientes (bloqueantes para fases futuras)

Estas preguntas no bloquean la Fase 0, pero deben resolverse antes de las fases indicadas:

| Pregunta | Necesaria en |
|----------|-------------|
| Ruta/disco definitivo para datos y documentos | Fase 1 / .env |
| Datos legales de la empresa (razón social, CIF, CCC) | Fase 2B (PDF jornada) |
| Logo de Cruz Blanca en PNG/SVG de alta calidad | Fase 2B / Fase 3 |
| Tipografías y textos legales exactos de los PDFs | Fase 2B / Fase 3 |
| ¿Una o dos franjas diarias habituales en el registro? | Fase 2B |
| Número máximo habitual de platos por menú | Fase 3 |
| Tailscale o Cloudflare Tunnel para acceso exterior | Fase 4 |
| Qué puede hacer exactamente el rol ENCARGADO | Fase 1 (permisos) |
