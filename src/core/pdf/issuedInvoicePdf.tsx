/**
 * PDF — Factura Emitida
 * Formato: A4 portrait, tabla de líneas, desglose IVA
 */
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Image, renderToBuffer,
} from "@react-pdf/renderer";
import { LOGO_CRUZ_B64 } from "@/core/pdf/issuedInvoicePdfAssets";

export interface IssuedInvoicePdfLine {
  description: string;
  quantity: number;
  unitPriceInCents: number;
  vatRate: number;
}

export interface IssuedInvoicePdfData {
  invoiceNumber: string;
  issueDate: string;      // YYYY-MM-DD
  status: string;
  rectifiesNumber: string | null;
  companyName: string;
  companyAddress: string;
  companyCif: string;
  companyPhone: string;
  companyEmail: string;
  companySignatureName: string;
  clientName: string;
  clientNif: string | null;
  clientAddress: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  lines: IssuedInvoicePdfLine[];
  baseInCents: number;
  vatInCents: number;
  totalInCents: number;
  notes: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Estilos ───────────────────────────────────────────────────

const GRAY = "#9ca3af";
const DARK = "#111827";
const MID  = "#374151";
const LIGHT_BG = "#f3f4f6";
const BORDER = "#d1d5db";
const PRIMARY = "#1d4ed8";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: DARK, padding: 40 },

  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  companyBlock: { flex: 1, flexDirection: "column" },
  logo: { width: 180, height: 36, objectFit: "contain", marginBottom: 6 },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PRIMARY, marginBottom: 3 },
  companyDetail: { fontSize: 8, color: MID, marginBottom: 1 },
  invoiceBlock: { alignItems: "flex-end" },
  invoiceLabel: { fontSize: 18, fontFamily: "Helvetica-Bold", color: DARK, marginBottom: 2 },
  invoiceNumber: { fontSize: 11, fontFamily: "Helvetica-Bold", color: PRIMARY },
  invoiceDate: { fontSize: 9, color: MID, marginTop: 2 },
  rectificaBadge: { fontSize: 8, color: "#dc2626", marginTop: 3 },
  voidedBadge: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#dc2626", marginTop: 3 },

  divider: { borderBottomWidth: 1, borderBottomColor: PRIMARY, marginBottom: 16 },

  // Cliente
  sectionTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: GRAY,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  clientBlock: { marginBottom: 20, backgroundColor: LIGHT_BG, padding: 10, borderRadius: 4 },
  clientName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  clientDetail: { fontSize: 8, color: MID, marginBottom: 1 },

  // Tabla
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: "row", backgroundColor: DARK, padding: "6 8" },
  tableHeaderCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, padding: "5 8" },
  tableRowAlt: { flexDirection: "row", backgroundColor: LIGHT_BG, padding: "5 8" },
  tableCell: { fontSize: 8, color: MID },

  // Column widths
  colDesc: { flex: 4 },
  colPrice: { flex: 1.5, textAlign: "right" },
  colQty: { flex: 1, textAlign: "right" },
  colVat: { flex: 1, textAlign: "right" },
  colImporte: { flex: 1.5, textAlign: "right" },

  // Totales
  totalsWrapper: { alignItems: "flex-end", marginTop: 8 },
  totalsTable: { width: 260, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  totalsHeaderRow: { flexDirection: "row", backgroundColor: DARK, padding: "5 8" },
  totalsHeaderCell: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#ffffff", flex: 1, textAlign: "center" },
  totalsRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, padding: "5 8" },
  totalsCell: { fontSize: 8, flex: 1, textAlign: "center", color: MID },
  totalsFinalRow: { flexDirection: "row", backgroundColor: PRIMARY, padding: "6 8", borderRadius: "0 0 3 3" },
  totalsFinalLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#ffffff", flex: 2, textAlign: "right", paddingRight: 8 },
  totalsFinalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#ffffff", flex: 1.5, textAlign: "right" },

  // Notas
  notesBlock: { marginTop: 20, backgroundColor: LIGHT_BG, padding: 10, borderRadius: 4 },
  notesText: { fontSize: 8, color: MID },

  // Footer
  footer: { position: "absolute", bottom: 25, left: 40, right: 40,
    borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6, textAlign: "center" },
  footerText: { fontSize: 7, color: GRAY },
});

// ── Componente PDF ────────────────────────────────────────────

function IssuedInvoiceDocument({ data }: { data: IssuedInvoicePdfData }) {
  // Desglose IVA agrupado por tipo
  const vatGroups: Record<number, { base: number; vat: number }> = {};
  for (const l of data.lines) {
    const sub = Math.round(l.quantity * l.unitPriceInCents);
    const vat = Math.round(sub * l.vatRate / 100);
    if (!vatGroups[l.vatRate]) vatGroups[l.vatRate] = { base: 0, vat: 0 };
    vatGroups[l.vatRate].base += sub;
    vatGroups[l.vatRate].vat += vat;
  }
  const vatRates = Object.keys(vatGroups).map(Number).sort();

  const isVoided = data.status === "VOIDED";
  const displayName = data.companySignatureName || data.companyName;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.companyBlock}>
            <Image style={styles.logo} src={`data:image/png;base64,${LOGO_CRUZ_B64}`} />
            <Text style={styles.companyName}>{displayName}</Text>
            {data.companyAddress ? <Text style={styles.companyDetail}>{data.companyAddress}</Text> : null}
            {data.companyCif ? <Text style={styles.companyDetail}>CIF: {data.companyCif}</Text> : null}
            {data.companyPhone ? <Text style={styles.companyDetail}>Tel: {data.companyPhone}</Text> : null}
            {data.companyEmail ? <Text style={styles.companyDetail}>{data.companyEmail}</Text> : null}
          </View>
          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceLabel}>FACTURA</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>Fecha: {fmtDate(data.issueDate)}</Text>
            {data.rectifiesNumber
              ? <Text style={styles.rectificaBadge}>Rectifica: {data.rectifiesNumber}</Text>
              : null}
            {isVoided ? <Text style={styles.voidedBadge}>ANULADA</Text> : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Cliente ── */}
        <Text style={styles.sectionTitle}>Datos del cliente</Text>
        <View style={styles.clientBlock}>
          <Text style={styles.clientName}>{data.clientName}</Text>
          {data.clientNif ? <Text style={styles.clientDetail}>NIF/CIF: {data.clientNif}</Text> : null}
          {data.clientAddress ? <Text style={styles.clientDetail}>{data.clientAddress}</Text> : null}
          {data.clientPhone ? <Text style={styles.clientDetail}>Tel: {data.clientPhone}</Text> : null}
        </View>

        {/* ── Tabla de líneas ── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>PRODUCTO / SERVICIO</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>PRECIO</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>CANT.</Text>
            <Text style={[styles.tableHeaderCell, styles.colVat]}>IVA %</Text>
            <Text style={[styles.tableHeaderCell, styles.colImporte]}>IVA (€)</Text>
          </View>
          {data.lines.map((l, idx) => {
            const sub = Math.round(l.quantity * l.unitPriceInCents);
            const vatAmt = Math.round(sub * l.vatRate / 100);
            const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
            return (
              <View key={idx} style={rowStyle}>
                <Text style={[styles.tableCell, styles.colDesc]}>{l.description}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>{fmt(l.unitPriceInCents)}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>
                  {l.quantity.toLocaleString("es-ES", { minimumFractionDigits: l.quantity % 1 === 0 ? 2 : 3 })}
                </Text>
                <Text style={[styles.tableCell, styles.colVat]}>{l.vatRate.toFixed(0)}%</Text>
                <Text style={[styles.tableCell, styles.colImporte]}>{fmt(vatAmt)}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Totales ── */}
        <View style={styles.totalsWrapper}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsHeaderRow}>
              <Text style={styles.totalsHeaderCell}>BASE IMPONIBLE</Text>
              <Text style={styles.totalsHeaderCell}>TIPO IVA</Text>
              <Text style={styles.totalsHeaderCell}>TOTAL IVA</Text>
            </View>
            {vatRates.map(rate => (
              <View key={rate} style={styles.totalsRow}>
                <Text style={styles.totalsCell}>{fmt(vatGroups[rate].base)}</Text>
                <Text style={styles.totalsCell}>{rate.toFixed(0)}%</Text>
                <Text style={styles.totalsCell}>{fmt(vatGroups[rate].vat)}</Text>
              </View>
            ))}
            {vatRates.length > 1 && (
              <View style={[styles.totalsRow, { borderTopWidth: 1, borderTopColor: BORDER }]}>
                <Text style={[styles.totalsCell, { fontFamily: "Helvetica-Bold" }]}>{fmt(data.baseInCents)}</Text>
                <Text style={[styles.totalsCell, { fontFamily: "Helvetica-Bold" }]}>TOTAL</Text>
                <Text style={[styles.totalsCell, { fontFamily: "Helvetica-Bold" }]}>{fmt(data.vatInCents)}</Text>
              </View>
            )}
            <View style={styles.totalsFinalRow}>
              <Text style={styles.totalsFinalLabel}>TOTAL A PAGAR</Text>
              <Text style={styles.totalsFinalValue}>{fmt(data.totalInCents)}</Text>
            </View>
          </View>
        </View>

        {/* ── Notas ── */}
        {data.notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {displayName}{data.companyCif ? ` · CIF: ${data.companyCif}` : ""}
            {data.companyAddress ? ` · ${data.companyAddress}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateIssuedInvoicePdf(data: IssuedInvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<IssuedInvoiceDocument data={data} />);
}
