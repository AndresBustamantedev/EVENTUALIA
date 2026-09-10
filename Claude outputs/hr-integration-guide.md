# Guía de integración — HR edit/delete

## 1. Añadir server actions a los archivos existentes

### contracts.ts
Abre `src/modules/hr/actions/contracts.ts` y **pega al final** el contenido de `contracts-extra.ts`.

### schedules.ts
Abre `src/modules/hr/actions/schedules.ts` y **pega al final** el contenido de `schedules-extra.ts`.

> **Nota modelo Prisma para schedules:** El action `updateScheduleAction` elimina los
> `ScheduleDayTemplate` del horario y los recrea. Comprueba que el nombre del modelo
> en tu schema sea `scheduleDayTemplate` (o ajusta el nombre en el action si difiere).

### timeRecords.ts
Abre `src/modules/hr/actions/timeRecords.ts` y **pega al final** el contenido de `timeRecords-extra.ts`.

---

## 2. Copiar componentes

Copia los 5 archivos de `hr-components/` a `src/modules/hr/components/`:

- `ContractEditModal.tsx`
- `ContractDeleteButton.tsx`
- `ScheduleEditModal.tsx`
- `ScheduleDeleteButton.tsx`
- `TimeRecordDeleteButton.tsx`
- `HrEmployeeTabsClient.tsx`

---

## 3. Actualizar hr/[id]/page.tsx

En el tab **Contratos**, sustituye el bloque que renderiza la lista de contratos por:

```tsx
import { HrContractsList } from "@/modules/hr/components/HrEmployeeTabsClient";

// ... dentro del tab:
<HrContractsList
  contracts={contracts}        // el array que ya tienes
  employeeId={employee.id}
  canWrite={canWrite}
/>
```

En el tab **Horario**, sustituye el bloque que renderiza los horarios por:

```tsx
import { HrSchedulesList } from "@/modules/hr/components/HrEmployeeTabsClient";

<HrSchedulesList
  schedules={schedules}        // el array que ya tienes
  employeeId={employee.id}
  canWrite={canWrite}
/>
```

En el tab **Jornada**, sustituye el bloque que renderiza los registros de jornada por:

```tsx
import { HrTimeRecordsList } from "@/modules/hr/components/HrEmployeeTabsClient";

<HrTimeRecordsList
  records={timeRecords}        // el array que ya tienes
  employeeId={employee.id}
  canWrite={canWrite}
/>
```

---

## 4. Comportamiento VACACIONES

Al crear o editar un horario, aparece un checkbox **"Este período es de VACACIONES"**.
Cuando está marcado:
- La tabla de turnos se oculta.
- Todos los días se guardan como `isRestDay: true`.
- Las `notes` del horario comienzan con `"VACACIONES\n"` (identificador interno).
- En la ficha del empleado aparece la badge naranja 🏖 VACACIONES.

No se requiere ningún cambio de schema en Prisma: usa el campo `notes` existente.

---

## 5. Permisos requeridos

Las acciones usan los mismos permisos que ya tienes:
- `hr:contracts:write` — editar y eliminar contratos
- `hr:schedules:write` — editar y eliminar horarios  
- `hr:records:write`   — eliminar registros de jornada

---

## 6. Restricciones

- **Contratos**: se pueden editar y eliminar libremente.
- **Horarios**: se pueden editar y eliminar libremente.
- **Jornada**: sólo se pueden eliminar registros en estado `DRAFT`.
  Un registro `CLOSED` muestra un guión en vez del botón de eliminar.
  Para eliminarlo hay que reabrirlo primero (flujo ya existente).
