/**
 * Generador de PDF — Registro mensual de jornada
 *
 * Documento oficial para firma del trabajador/a y empresa.
 * Cumplimiento: RD 8/2019 — obligación de registro diario de jornada.
 *
 * NOTA: no incluir datos sensibles (DNI, NAF) en el PDF
 * sin que el flujo de descarga haya comprobado permiso.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ── Tipos ─────────────────────────────────────────────────────

export interface PdfDayRow {
  date: string;
  dayType: string;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalMinutes: number | null;
  ordinaryMinutes: number | null;
  overtimeMinutes: number | null;
  observation: string | null;
}

export interface TimeRecordPdfData {
  companyName: string;
  companyAddress?: string;
  companyCif: string;
  signatureCompanyName?: string; // nombre legal para la firma (puede diferir del nombre comercial)
  employeeName: string;
  year: number;
  month: number;
  contractType: string;
  weeklyHours: string;
  days: PdfDayRow[];
  totalOrdinaryMinutes: number;
  totalOvertimeMinutes: number;
}

// ── Helpers ───────────────────────────────────────────────────

const MONTH_NAMES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_TYPE_LABEL: Record<string, string> = {
  WORK:       "Trabajo",
  REST:       "Descanso",
  HOLIDAY:    "Festivo",
  ABSENCE:    "Ausencia",
  VACATION:   "Vacaciones",
  SICK_LEAVE: "Baja",
};

function minutesToHM(minutes: number | null): string {
  if (minutes === null || minutes === 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDate(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${parts[2]}/${parts[1]}`;
}

function weekdayLetter(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return ["D", "L", "M", "X", "J", "V", "S"][d.getUTCDay()];
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

// ── Colores ────────────────────────────────────────────────────

const BLACK     = "#111111";
const GRAY_DARK = "#333333";
const GRAY_MID  = "#666666";
const GRAY_LITE = "#f4f4f4";
const GRAY_BRD  = "#d0d0d0";
const WHITE     = "#ffffff";
const ACCENT    = "#1a1a1a";

// ── Estilos — A4 portrait (535pt usable width) ────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 7,
    paddingTop: 28,
    paddingBottom: 72,   // espacio para firmas (absolute)
    paddingHorizontal: 30,
    color: BLACK,
    backgroundColor: WHITE,
  },

  // Cabecera
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 5,
    paddingBottom: 7,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
  },
  companyBlock: { flex: 1 },
  companyName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: BLACK,
    marginBottom: 1,
  },
  companyCif: { fontSize: 6.5, color: GRAY_MID },
  docBlock: { alignItems: "flex-end" },
  docTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BLACK,
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  docSubtitle: {
    fontSize: 8.5,
    color: GRAY_DARK,
    fontFamily: "Helvetica-Bold",
  },

  // Barra empleado
  employeeBar: {
    flexDirection: "row",
    marginBottom: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: GRAY_BRD,
    borderRadius: 2,
  },
  empCell: {
    flex: 1,
    padding: "4 7",
    borderRightWidth: 1,
    borderRightColor: GRAY_BRD,
  },
  empCellLast: { flex: 1, padding: "4 7" },
  empLabel: { fontSize: 5.5, color: GRAY_MID, marginBottom: 1.5, letterSpacing: 0.3 },
  empValue: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK },

  // Tabla
  table: { width: "100%", marginBottom: 5 },
  thead: {
    flexDirection: "row",
    backgroundColor: ACCENT,
    paddingVertical: 3,
  },
  th: {
    color: WHITE,
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    paddingHorizontal: 3,
  },
  trEven: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: GRAY_BRD,
    backgroundColor: WHITE,
    minHeight: 12,
  },
  trOdd: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: GRAY_BRD,
    backgroundColor: GRAY_LITE,
    minHeight: 12,
  },
  trWeekend: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: GRAY_BRD,
    backgroundColor: "#e8e8e8",
    minHeight: 12,
  },
  td: { fontSize: 6.5, paddingVertical: 1.5, paddingHorizontal: 3, color: BLACK },

  // Anchos de columna para portrait (535pt usable)
  colDate:  { width: "8%" },
  colDay:   { width: "4%" },
  colType:  { width: "11%" },
  colMorn:  { width: "16%" },
  colAftn:  { width: "16%" },
  colTotal: { width: "9%" },
  colOrd:   { width: "9%" },
  colOvt:   { width: "9%" },
  colObs:   { width: "18%" },

  // Totales
  totalsBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 20,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1.5,
    borderTopColor: ACCENT,
    marginBottom: 7,
  },
  totalItem: { alignItems: "flex-end" },
  totalLabel: { fontSize: 6, color: GRAY_MID, marginBottom: 1 },
  totalValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLACK },

  // Aviso legal
  legalBox: {
    borderWidth: 0.5,
    borderColor: GRAY_BRD,
    borderRadius: 2,
    padding: "4 7",
    marginBottom: 8,
    backgroundColor: GRAY_LITE,
  },
  legalText: { fontSize: 5.5, color: GRAY_MID, lineHeight: 1.5 },

  // Firmas — absolute para no desbordar página
  signaturesBlock: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
  },
  signaturesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
  },
  signatureBox: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: GRAY_DARK,
    paddingTop: 5,
  },
  sigTitle: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: GRAY_DARK,
    marginBottom: 2,
  },
  sigDetail: { fontSize: 6, color: GRAY_MID, marginTop: 2, lineHeight: 1.45 },
  pageNum: { fontSize: 6, textAlign: "center", color: GRAY_MID, marginTop: 7 },
});

// ── Componente PDF ────────────────────────────────────────────

function TimeRecordDocument({ data }: { data: TimeRecordPdfData }) {
  const totalMinutes = data.days.reduce((s, d) => s + (d.totalMinutes ?? 0), 0);
  const monthName = MONTH_NAMES[data.month] ?? "";
  const sigName = data.signatureCompanyName ?? data.companyName;

  const ctypeMap: Record<string, string> = {
    indefinido:    "Indefinido",
    temporal:      "Temporal",
    formacion:     "En prácticas / formación",
    interinidad:   "Interinidad",
    obra_servicio: "Obra y servicio",
    otro:          "Otro",
  };
  const contractLabel = ctypeMap[data.contractType] ?? data.contractType;
  const dimColor = { color: GRAY_MID };

  return (
    <Document
      title={`Registro jornada ${monthName} ${data.year} — ${data.employeeName}`}
      author={data.companyName}
      subject="Registro de jornada laboral"
    >
      <Page size="A4" style={S.page}>

        {/* Cabecera */}
        <View style={S.headerRow}>
          <View style={S.companyBlock}>
            <Text style={S.companyName}>{data.companyName}</Text>
            {data.companyCif ? (
              <Text style={S.companyCif}>CIF: {data.companyCif}</Text>
            ) : null}
          </View>
          <View style={S.docBlock}>
            <Text style={S.docTitle}>REGISTRO DE JORNADA</Text>
            <Text style={S.docSubtitle}>{monthName.toUpperCase()} {data.year}</Text>
          </View>
        </View>

        {/* Barra empleado */}
        <View style={S.employeeBar}>
          <View style={S.empCell}>
            <Text style={S.empLabel}>EMPLEADO/A</Text>
            <Text style={S.empValue}>{data.employeeName}</Text>
          </View>
          <View style={S.empCell}>
            <Text style={S.empLabel}>TIPO CONTRATO</Text>
            <Text style={S.empValue}>{contractLabel}</Text>
          </View>
          <View style={S.empCell}>
            <Text style={S.empLabel}>H. SEMANALES</Text>
            <Text style={S.empValue}>{data.weeklyHours} h/sem</Text>
          </View>
          <View style={S.empCell}>
            <Text style={S.empLabel}>PERÍODO</Text>
            <Text style={S.empValue}>{monthName} {data.year}</Text>
          </View>
          <View style={S.empCellLast}>
            <Text style={S.empLabel}>TOTAL HORAS</Text>
            <Text style={S.empValue}>{minutesToHM(totalMinutes)}</Text>
          </View>
        </View>

        {/* Tabla */}
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, S.colDate]}>Fecha</Text>
            <Text style={[S.th, S.colDay]}>D</Text>
            <Text style={[S.th, S.colType]}>Tipo</Text>
            <Text style={[S.th, S.colMorn]}>Mañana</Text>
            <Text style={[S.th, S.colAftn]}>Tarde/Noche</Text>
            <Text style={[S.th, S.colTotal]}>Total</Text>
            <Text style={[S.th, S.colOrd]}>Ordin.</Text>
            <Text style={[S.th, S.colOvt]}>Extras</Text>
            <Text style={[S.th, S.colObs]}>Observación</Text>
          </View>

          {data.days.map((day, idx) => {
            const weekend = isWeekend(day.date);
            const isWork  = day.dayType === "WORK";
            const rowStyle = weekend ? S.trWeekend : idx % 2 === 0 ? S.trEven : S.trOdd;
            const morn = day.morningStart && day.morningEnd
              ? `${day.morningStart}–${day.morningEnd}` : "—";
            const aftn = day.afternoonStart && day.afternoonEnd
              ? `${day.afternoonStart}–${day.afternoonEnd}` : "—";
            const typeLabel = DAY_TYPE_LABEL[day.dayType] ?? day.dayType;

            return (
              <View key={day.date} style={rowStyle}>
                <Text style={[S.td, S.colDate, !isWork && dimColor]}>{fmtDate(day.date)}</Text>
                <Text style={[S.td, S.colDay,  !isWork && dimColor]}>{weekdayLetter(day.date)}</Text>
                <Text style={[S.td, S.colType, !isWork && dimColor]}>{typeLabel}</Text>
                <Text style={[S.td, S.colMorn, !isWork && dimColor]}>{isWork ? morn : "—"}</Text>
                <Text style={[S.td, S.colAftn, !isWork && dimColor]}>{isWork ? aftn : "—"}</Text>
                <Text style={[S.td, S.colTotal, { textAlign: "right" as const }, !isWork && dimColor]}>
                  {isWork ? minutesToHM(day.totalMinutes) : "—"}
                </Text>
                <Text style={[S.td, S.colOrd, { textAlign: "right" as const }, !isWork && dimColor]}>
                  {isWork ? minutesToHM(day.ordinaryMinutes) : "—"}
                </Text>
                <Text style={[S.td, S.colOvt, { textAlign: "right" as const }, !isWork && dimColor]}>
                  {day.overtimeMinutes && day.overtimeMinutes > 0 ? minutesToHM(day.overtimeMinutes) : "—"}
                </Text>
                <Text style={[S.td, S.colObs, dimColor]}>{day.observation ?? ""}</Text>
              </View>
            );
          })}
        </View>

        {/* Totales */}
        <View style={S.totalsBar}>
          <View style={S.totalItem}>
            <Text style={S.totalLabel}>Total horas trabajadas</Text>
            <Text style={S.totalValue}>{minutesToHM(totalMinutes)}</Text>
          </View>
          <View style={S.totalItem}>
            <Text style={S.totalLabel}>Horas ordinarias</Text>
            <Text style={S.totalValue}>{minutesToHM(data.totalOrdinaryMinutes)}</Text>
          </View>
          <View style={S.totalItem}>
            <Text style={S.totalLabel}>Horas extraordinarias</Text>
            <Text style={S.totalValue}>{minutesToHM(data.totalOvertimeMinutes)}</Text>
          </View>
        </View>

        {/* Aviso legal */}
        <View style={S.legalBox}>
          <Text style={S.legalText}>
            Documento generado en cumplimiento del artículo 34.9 del Estatuto de los Trabajadores (RD-ley 8/2019, de 8 de marzo) que obliga
            al registro diario de jornada de cada trabajador/a. El presente documento acredita las horas realizadas durante el período indicado.
            La empresa conservará los registros durante un mínimo de 4 años y estarán a disposición de la Inspección de Trabajo y los representantes
            de los trabajadores. La firma implica la conformidad con los datos reflejados.
          </Text>
        </View>

        {/* Firmas */}
        <View style={S.signaturesBlock}>
          <View style={S.signaturesRow}>
            <View style={S.signatureBox}>
              <Text style={S.sigTitle}>Firma del trabajador/a</Text>
              <Text style={S.sigDetail}>Nombre: {data.employeeName}</Text>
              <Text style={S.sigDetail}>DNI/NIE: _____________________</Text>
              <Text style={S.sigDetail}>Fecha: _______________________</Text>
            </View>
            <View style={S.signatureBox}>
              <Text style={S.sigTitle}>Firma y sello de la empresa</Text>
              <Text style={S.sigDetail}>{sigName}</Text>
              {data.companyCif ? (
                <Text style={S.sigDetail}>CIF: {data.companyCif}</Text>
              ) : null}
              <Text style={S.sigDetail}>Fecha: _______________________</Text>
            </View>
          </View>
          <Text style={S.pageNum}>
            {data.companyName} · Registro de jornada laboral · {monthName} {data.year}
          </Text>
        </View>

      </Page>
    </Document>
  );
}

// ── Exportación ───────────────────────────────────────────────

export async function renderTimeRecordPdf(
  data: TimeRecordPdfData
): Promise<Buffer> {
  const buffer = await renderToBuffer(<TimeRecordDocument data={data} />);
  return buffer as Buffer;
}
