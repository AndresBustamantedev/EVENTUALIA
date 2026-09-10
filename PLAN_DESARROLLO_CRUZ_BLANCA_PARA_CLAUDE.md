# Cruz Blanca Gestión — guía de desarrollo para Claude

## Cómo utilizar este documento

No entregues todos los prompts a la vez. Abre una carpeta vacía o repositorio Git en Claude Code y ejecuta primero el **Prompt 0**. Después, entrega un prompt por fase y no avances hasta comprobar la lista de aceptación. Claude debe conservar `PROJECT_STATUS.md`, actualizarlo al terminar cada fase y leerlo antes de iniciar la siguiente.

No uses datos reales de empleados durante el desarrollo. Utiliza personas, DNI/NIE, NAF, teléfonos, nóminas y facturas ficticios.

## Material que debes darle a Claude

1. Este documento completo.
2. Las dos imágenes de referencia:
   - El Excel actual de registro de jornada.
   - La composición actual de los tres documentos del menú.
3. Cuando los tengas: logo de Cruz Blanca en PNG/SVG de buena calidad, tipografías utilizadas, textos legales exactos, CIF/razón social/CCC y tamaño de papel deseado.
4. Para afinar el PDF de jornada: un Excel original anonimizado, no solo una captura.
5. Para afinar los menús: los archivos originales de Illustrator o PDF exportados, con textos convertidos o las fuentes incluidas.

Si todavía no tienes los elementos de los puntos 3–5, Claude debe usar recursos provisionales claramente marcados y continuar. No deben bloquear el MVP.

---

## Prompt 0 — contrato de trabajo para Claude

```text
Actúa como arquitecto y desarrollador principal de “Cruz Blanca Gestión”, una aplicación web modular de uso interno para un restaurante en España.

OBJETIVO
Construir un sistema autohospedado en el PC Windows del restaurante, accesible en la red local y posteriormente desde fuera mediante Tailscale o Cloudflare Tunnel, sin abrir puertos directamente. Los primeros módulos serán RRHH y Menú del día. Más adelante se añadirán Proveedores/Facturas con OCR, inventario, APPCC y otros módulos sin rehacer el núcleo.

STACK FIJO
- Next.js estable con App Router y TypeScript estricto.
- React, Tailwind CSS y shadcn/ui.
- PostgreSQL y Prisma ORM.
- Auth.js con credenciales locales y contraseñas Argon2id.
- Zod para validación compartida.
- Generación de PDF desde el servidor con una solución compatible con Docker.
- Docker Compose para app y PostgreSQL.
- Almacenamiento de documentos en volumen local persistente, detrás de una interfaz StorageProvider que permita migrar a S3 compatible.
- Vitest para lógica/unidad y Playwright para flujos críticos.

CONDICIONES DE ARQUITECTURA
- Monolito modular, no microservicios.
- UI y nombres visibles en español; código, tablas y variables en inglés.
- Zona horaria Europe/Madrid, fechas almacenadas de forma inequívoca y dinero en céntimos enteros.
- Módulos aislados dentro de src/modules, compartiendo auth, usuarios, permisos, auditoría, archivos y configuración.
- Preparar proveedores y facturas para OCR futuro mediante un proveedor intercambiable; no implementar OCR aún.
- No exponer documentos con rutas públicas. Toda descarga debe comprobar sesión y permiso.
- No registrar contraseñas, cookies, DNI/NIE, NAF ni contenido documental en logs.
- Los datos y documentos deben sobrevivir a reconstrucciones y actualizaciones de contenedores.
- No abrir puertos del router ni configurar acceso público en esta fase.
- No inventar reglas laborales o legales. Los registros son documentos administrativos editables; la app no sustituye asesoramiento laboral.

FORMA DE TRABAJO
1. Antes de programar, inspecciona el repositorio y pregunta solo por decisiones que bloqueen realmente.
2. En esta primera interacción crea únicamente documentación de arquitectura y planificación, no toda la aplicación.
3. Crea y mantén: README.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/SECURITY.md, docs/BACKUP_RESTORE.md y PROJECT_STATUS.md.
4. En PROJECT_STATUS.md registra fase actual, decisiones, comandos, variables, migraciones, pruebas y pendientes.
5. En cada fase: presenta un plan corto, implementa solo esa fase, ejecuta lint/typecheck/tests/build, corrige errores y entrega resumen de archivos cambiados y pasos manuales.
6. No avances de fase por tu cuenta. Detente después de cumplir los criterios de aceptación.
7. No borres ni sobrescribas cambios existentes sin explicarlo. No uses secretos reales en el repositorio.
8. Usa commits pequeños si Git está disponible, pero no publiques nada ni hagas push sin autorización.

Ahora diseña la arquitectura, el árbol de módulos, el modelo inicial de datos y las decisiones de seguridad. Señala cualquier cambio de stack que consideres imprescindible, pero no lo apliques sin justificarlo. Termina indicando si el proyecto está listo para la Fase 1.
```

### Resultado esperado

- Arquitectura documentada.
- Modelo de datos inicial revisable.
- Riesgos y supuestos visibles.
- Ningún intento de construir todas las funciones de una vez.

---

## Prompt 1 — núcleo ejecutable y seguridad básica

```text
Lee primero README.md, docs/* y PROJECT_STATUS.md. Implementa únicamente la Fase 1: núcleo ejecutable.

ALCANCE
- Inicializar Next.js/TypeScript/Tailwind/shadcn si aún no existe.
- Docker Compose con app, PostgreSQL, healthchecks y volúmenes persistentes.
- Prisma con migraciones reproducibles y seed de desarrollo.
- Login local, cierre de sesión, sesiones seguras y cambio de contraseña.
- Modelo User, Role/Permission o RBAC equivalente, AuditLog, AppSetting y StoredFile.
- Roles iniciales: ADMIN, RRHH, ENCARGADO y COCINA.
- Layout autenticado responsive con inicio y navegación modular.
- Pantalla de acceso y dashboard provisional con tarjetas RRHH, Menús y Proveedores (este último marcado “Próximamente”).
- Middleware/guardas en servidor; no confiar solo en ocultar botones.
- Endpoint de salud que no revele secretos.
- `.env.example` sin valores reales.

SEGURIDAD
- La primera cuenta administradora se crea mediante un comando/seed explícito y obliga a cambiar la contraseña provisional.
- Cookies httpOnly, sameSite apropiado y secure en producción.
- Limitación básica de intentos de inicio de sesión.
- Auditoría de login, logout, creación/cambio/desactivación de usuarios sin datos sensibles.
- Cabeceras de seguridad razonables.

PRUEBAS/ACEPTACIÓN
- `docker compose up` levanta la aplicación y la base de datos desde cero.
- Login correcto e incorrecto probados.
- Una ruta RRHH devuelve acceso denegado a COCINA incluso llamándola directamente.
- Reiniciar/reconstruir contenedores no elimina la base de datos.
- Lint, typecheck, pruebas y build pasan.
- Actualiza documentación y PROJECT_STATUS.md y detente.
```

---

## Prompt 2 — RRHH: empleados, contratos y horarios

```text
Lee la documentación y PROJECT_STATUS.md. Implementa únicamente la Fase 2A del módulo RRHH.

DATOS Y FUNCIONES
- CRUD de empleados con: nombre, apellidos, DNI/NIE, NAF, teléfono, email, dirección, contacto de emergencia opcional, estado (activo/inactivo/baja), fecha de alta y notas.
- No eliminar físicamente empleados con historial: archivar/desactivar.
- Contratos versionados con tipo, inicio, fin opcional, horas semanales, horas mensuales opcionales, jornada completa/parcial y notas.
- Horario habitual versionado y con fecha de vigencia. Cada día admite descanso o uno/dos tramos (mañana y tarde), incluso cruzar medianoche.
- Lista con búsqueda, filtros de estado y ficha del trabajador por pestañas: resumen, contrato/horario, registros y documentos.
- Cifrar a nivel de aplicación los campos identificativos sensibles que se haya decidido cifrar en docs/SECURITY.md; las claves deben venir del entorno y estar preparadas para rotación. Si el cifrado impide búsquedas, documenta el compromiso y usa un hash ciego cuando proceda.
- Permisos: ADMIN y RRHH acceso completo; ENCARGADO solo lo autorizado explícitamente; COCINA sin acceso.
- Auditoría de altas, ediciones, cambios contractuales y consulta/descarga de datos sensibles.

REGLAS
- Validaciones españolas flexibles: aceptar formatos razonables, normalizar y no rechazar documentos extranjeros por una regla demasiado estricta.
- Impedir contratos/horarios incoherentes mediante validación clara, sin inventar normativa.
- Seed solo con empleados ficticios.

ACEPTACIÓN
- Crear un trabajador, asignar contrato y horario semanal, editarlo creando historial y desactivarlo.
- Ver qué contrato/horario estaba vigente en una fecha dada.
- Comprobar permisos por UI y servidor.
- Lint, typecheck, pruebas y build pasan.
- Actualiza PROJECT_STATUS.md y detente.
```

---

## Prompt 3 — RRHH: registro mensual y PDF

```text
Lee la documentación, PROJECT_STATUS.md y la imagen/archivo anonimizado del registro de jornada actual. Implementa únicamente la Fase 2B.

FLUJO
1. Elegir empleado y mes.
2. Crear borrador desde el horario vigente para cada fecha del mes.
3. Permitir editar por día los tramos de mañana y tarde, descanso, ausencia, vacaciones, baja, festivo y observación.
4. Calcular duración correctamente, incluidos turnos que cruzan medianoche, y mostrar horas ordinarias y extraordinarias como campos revisables. No decidir automáticamente qué es hora extra basándose solo en superar 8 horas.
5. Permitir bloquear/cerrar el mes y reabrirlo solo con permiso y motivo auditado.
6. Generar PDF A4 listo para imprimir y firmar.

EL PDF DEBE CONTENER
- Logo y datos configurables de empresa: razón social, CIF y CCC.
- Datos del trabajador: nombre y apellidos, NIF/NIE y NAF.
- Periodo de liquidación y fecha.
- Filas para todos los días del mes.
- Columnas: día del mes; mañana entrada/salida; tarde entrada/salida; total horas jornada; horas ordinarias; horas extraordinarias; firma diaria del trabajador.
- Total mensual, texto legal configurable, espacio de firma del trabajador, firma de empresa y fecha.
- Saltos, tipografía y márgenes legibles. Nunca cortar la tabla o las firmas.

DATOS
- Guardar el snapshot mensual; cambios posteriores del horario habitual no pueden modificar un registro ya creado.
- Versionar/reemplazar el PDF generado conservando trazabilidad.
- Evitar duplicados para el mismo empleado/mes mediante restricción en base de datos e idempotencia.

ACEPTACIÓN
- Meses de 28/29/30/31 días.
- Turno normal, partido y cruzando medianoche.
- Totales probados con lógica de minutos, no floats.
- Vista previa y descarga protegida.
- Comparación visual con la referencia y prueba de PDF renderizado.
- Lint, typecheck, pruebas y build pasan.
- Actualiza PROJECT_STATUS.md y detente.
```

---

## Prompt 4 — documentos de empleados

```text
Lee la documentación y PROJECT_STATUS.md. Implementa únicamente la Fase 2C: archivo documental de RRHH.

ALCANCE
- Subida mediante selector y arrastrar/soltar.
- Categorías: contrato, DNI/NIE, Seguridad Social, nómina, nómina firmada, finiquito, baja médica, alta médica, vacaciones, comunicación y otro.
- Asociación opcional a año/mes y metadatos: título, fecha documental, notas, versión y estado pendiente/firmado.
- Vista por empleado y estructura visual por año/mes; no depender de nombres de carpetas para la integridad de los datos.
- Formatos inicialmente admitidos: PDF, JPG, PNG. Validar extensión, MIME real, tamaño máximo configurable y nombre seguro.
- Los archivos físicos deben usar identificadores opacos, nunca DNI o nombre del empleado en la ruta.
- Descarga/preview siempre autenticada y autorizada, con auditoría.
- Hash SHA-256 para integridad y detección de duplicados.
- Borrado lógico/papelera; purga solo administrativa y auditada.
- Indicador mensual de registro generado, nómina recibida y nómina firmada.

ACEPTACIÓN
- Subir, clasificar, visualizar, descargar, reemplazar/versionar y enviar a papelera.
- Un usuario COCINA no puede obtener el archivo conociendo su ID o URL.
- Los archivos sobreviven a reconstrucción del contenedor.
- Pruebas incluyen nombres extraños, MIME falso y exceso de tamaño.
- Lint, typecheck, pruebas y build pasan.
- Actualiza docs/SECURITY.md, docs/BACKUP_RESTORE.md y PROJECT_STATUS.md y detente.
```

---

## Prompt 5 — Menú del día y tres PDFs

```text
Lee la documentación, PROJECT_STATUS.md y la referencia visual del menú. Implementa únicamente la Fase 3: Menú del día.

CATÁLOGO Y EDITOR
- Catálogo de platos con nombre, categoría (primero/segundo/otro), activo, alérgenos opcionales y frecuencia de uso.
- Autocompletado tolerante a tildes/mayúsculas y opción de crear un plato al escribir.
- Crear menú por fecha con precio en céntimos, primeros, segundos y notas.
- Reordenar platos, duplicar un menú anterior y consultar historial.
- Evitar dos menús activos para la misma fecha, pero permitir versiones/borradores.

SALIDA
Generar, previsualizar, descargar e imprimir en una operación un PDF combinado de tres páginas/documentos:
1. Primeros platos: identidad Cruz Blanca, título MENÚ DEL DÍA, precio y lista de primeros.
2. Segundos platos: identidad Cruz Blanca, lista de segundos y textos informativos/legales configurables.
3. Cocina: fecha, primeros y segundos en formato compacto de alta legibilidad, sin decoración innecesaria.

También permitir descargar cada documento por separado. Implementa un sistema de plantillas/configuración para logo, marca de agua, textos, tamaños y espaciado; no incrustes la composición de forma imposible de mantener. Usa provisionales si faltan assets. Maneja nombres largos ajustando tamaño/espaciado con límites, sin cortar texto ni desbordar.

PERMISOS
- ADMIN y ENCARGADO pueden editar/generar.
- COCINA solo puede consultar/imprimir el menú vigente y nunca accede a RRHH.

ACEPTACIÓN
- Crear el menú mostrado en la referencia, duplicarlo y modificar dos platos.
- PDFs A4 reproducibles, correctos con 3–8 platos por bloque y nombres largos.
- Impresión de las tres páginas con un clic mediante el diálogo estándar del navegador.
- Pruebas de cálculo/formato del precio e idempotencia.
- Comparación visual renderizada de los PDFs.
- Lint, typecheck, pruebas y build pasan.
- Actualiza PROJECT_STATUS.md y detente.
```

---

## Prompt 6 — instalación, copias y acceso remoto seguro

```text
Lee toda la documentación y PROJECT_STATUS.md. Implementa únicamente la Fase 4: preparación operativa para el PC Windows del restaurante.

ENTREGABLES
- Procedimiento reproducible para instalar Docker Desktop/WSL2 y levantar el sistema.
- Volúmenes y rutas configurables para PostgreSQL y documentos en un disco de datos, sin rutas personales hardcodeadas.
- Scripts seguros de backup de PostgreSQL + documentos + manifiesto/hashes, con rotación configurable y logs sin datos sensibles.
- Script y guía de restauración en un entorno de prueba. Un backup no se considera válido sin restauración ensayada.
- Política recomendada 3-2-1: copia local, disco externo y destino externo cifrado; no configurar ni subir a una nube sin autorización y credenciales del propietario.
- Guía para Tailscale como opción inicial de acceso remoto privado. Cloudflare Tunnel puede quedar documentado como alternativa, sin exposición directa de puertos.
- Runbook de actualización y rollback.
- Healthcheck y pantalla administrativa de estado que no muestre secretos.

ACEPTACIÓN
- Instalación desde cero documentada.
- Backup automático ejecutable y restauración verificada con datos ficticios.
- Reinicio del PC/servicios no pierde datos.
- No existe ningún documento accesible sin autenticación.
- Lint, typecheck, pruebas y build pasan.
- Actualiza documentación y PROJECT_STATUS.md y detente.
```

---

## Prompt 7 — Proveedores, facturas y OCR (después del MVP)

```text
Esta fase solo comienza cuando RRHH, Menús, backups y seguridad estén validados. Lee la documentación y PROJECT_STATUS.md. Implementa el módulo Proveedores/Facturas en dos entregas separadas.

ENTREGA A — SIN OCR
- Proveedores: razón social, nombre comercial, CIF/NIF, contacto, email, teléfono, forma de pago, IBAN protegido, notas y estado.
- Facturas: proveedor, número, fecha de emisión, vencimiento, base, impuestos desglosables, total, estado, método/fecha de pago, archivo original y notas.
- Importes en céntimos, monedas explícitas y restricción razonable contra duplicados.
- Filtros, totales mensuales y exportación CSV.
- Permisos y auditoría.
- Deja una interfaz `InvoiceExtractionProvider` y estados: NOT_REQUESTED, QUEUED, PROCESSING, NEEDS_REVIEW, CONFIRMED, FAILED.
- Pruebas, documentación, actualización de PROJECT_STATUS.md y detente para revisión.

ENTREGA B — OCR
- Implementa OCR mediante proveedor intercambiable. Propón primero opciones local y nube con coste, precisión, privacidad y requisitos; espera elección antes de integrar una.
- Nunca dar por correctos automáticamente proveedor, número, fecha, base, IVA o total: mostrar confianza por campo y exigir confirmación humana.
- Conservar el documento original, el resultado bruto separado y el dato confirmado.
- Procesamiento asíncrono, reintentos limitados e idempotencia.
- Validaciones aritméticas base + impuestos ≈ total con tolerancia explícita y aviso, no corrección silenciosa.
- No enviar documentos reales a servicios externos durante pruebas.
- Pruebas con facturas sintéticas/anónimas, documentación, PROJECT_STATUS.md y detente.
```

---

## Qué comprobar tú al final de cada fase

No te limites a aceptar que “compila”. Pide a Claude la URL local y comprueba manualmente el flujo. Después contesta con los fallos concretos y capturas.

### Fase 1

- Puedes entrar y salir.
- Un usuario de cocina no abre RRHH pegando directamente la URL.
- Los datos persisten tras reiniciar Docker.

### RRHH

- La ficha coincide con vuestro uso real.
- Un horario partido y uno nocturno calculan bien.
- Cambiar el horario habitual no altera meses cerrados.
- El PDF contiene cada columna y espacio de firma necesarios.
- Los documentos no se descargan sin iniciar sesión.

### Menús

- El PDF se parece a la plantilla y se imprime en el tamaño correcto.
- Los nombres largos no se cortan.
- El botón combinado abre las tres páginas.
- Cocina ve el menú, pero no los datos laborales.

### Operación

- Se ha restaurado realmente una copia en una base limpia.
- Sabes dónde están físicamente los datos y cómo recuperarlos.
- El acceso remoto funciona sin abrir puertos del router.

## Datos que debes decidir antes de cerrar el MVP

- Nombre final del sistema y URL interna.
- Datos legales exactos de la empresa para el registro.
- Qué usuarios existirán y qué puede hacer exactamente el encargado.
- Tamaño máximo de cada documento y años de conservación.
- Disco/ruta definitiva de datos y destino de copias.
- Si el registro de jornada necesita una o dos franjas diarias de forma habitual.
- Formato final de los tres documentos del menú y número máximo habitual de platos.
- Tailscale o Cloudflare Tunnel para el acceso exterior.

## Orden recomendado real

1. Prompt 0: arquitectura.
2. Prompt 1: núcleo y login.
3. Prompt 2: ficha laboral.
4. Prompt 3: registro mensual y PDF.
5. Prompt 4: documentos.
6. Prompt 5: menús.
7. Prompt 6: instalación, copias y acceso remoto.
8. Probarlo durante dos o tres semanas con datos no críticos y corregir.
9. Prompt 7A: proveedores/facturas.
10. Prompt 7B: OCR.

El MVP útil termina en el paso 6; el sistema no debería manejar documentación laboral real de forma estable hasta completar y verificar el paso 7 (backups, restauración y acceso seguro).
