/**
 * Generador de PDF — Menú del día Cruz Blanca
 *
 * Diseño replicado del template original:
 *   · A4 landscape · Logo colores arriba-izquierda
 *   · "MENÚ DEL DÍA" en Anton (Impact) arriba-derecha
 *   · Watermark logo fondo centrado
 *   · Títulos en Anton Bold, platos en Lora (Nyala-like)
 *   · Barra negra en footer
 *   · Texto "qué incluye" centrado al pie de página de Segundos
 *
 * 3 páginas A4 landscape:
 *   1. Primeros Platos
 *   2. Segundos Platos  (+ texto incluye al pie)
 *   3. Cocina           (sin decoración)
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  LOGO_B64,
  FONDO_B64,
  FONT_ANTON_B64,
  FONT_LORA_REG_B64,
  FONT_LORA_BOLD_B64,
  FONT_SYMBOLS_B64,
} from "./menuPdfAssets";

// ── Fuentes ────────────────────────────────────────────────────
// Anton → Impact (condensed black). Lora → Nyala (serif elegante).
// Embebidas como base64 para funcionar sin red en Docker.

Font.register({ family: "Anton",   src: FONT_ANTON_B64 });
Font.register({ family: "Symbols", src: FONT_SYMBOLS_B64 });
Font.register({
  family: "Lora",
  fonts: [
    { src: FONT_LORA_REG_B64,  fontWeight: "normal" },
    { src: FONT_LORA_BOLD_B64, fontWeight: "bold"   },
  ],
});

// ── Tipos ─────────────────────────────────────────────────────

export interface MenuPdfDish {
  name: string;
  allergens?: string | null;
}

export interface MenuPdfData {
  menuDate: string;       // "Vie 4/09/2026"
  menuDateLong: string;   // "viernes, 4 de septiembre de 2026"
  priceFormatted: string; // "14,50 €"
  menuTitle: string;      // "MENÚ DEL DÍA" | "MENÚ FIN DE SEMANA" | …
  firstCourses: MenuPdfDish[];
  secondCourses: MenuPdfDish[];
  otherDishes: MenuPdfDish[];
}

// ── Colores ────────────────────────────────────────────────────

const BLACK  = "#1a1a1a";
const WHITE  = "#FFFFFF";
const GRAY70 = "#4a4a4a";

// ── Helpers ────────────────────────────────────────────────────

/** Calcula tamaño de fuente para platos según cantidad, para llenar la página */
function dishFontSize(count: number): number {
  if (count <= 3)  return 38;
  if (count <= 4)  return 34;
  if (count <= 5)  return 29;
  if (count <= 6)  return 25;
  if (count <= 8)  return 21;
  return 18;
}

function dishLineHeight(count: number): number {
  if (count <= 3)  return 1.45;
  if (count <= 4)  return 1.40;
  if (count <= 5)  return 1.35;
  return 1.30;
}

// ── Estilos base ───────────────────────────────────────────────

const S = StyleSheet.create({
  // Página principal (Primeros / Segundos)
  page: {
    flexDirection: "column",
    backgroundColor: WHITE,
    paddingTop: 22,
    paddingBottom: 28,
    paddingHorizontal: 36,
    position: "relative",
  },

  // Watermark de fondo
  watermark: {
    position: "absolute",
    top: "10%",
    left: "22%",
    width: "56%",
    height: "80%",
    opacity: 0.10,
  },

  // Cabecera
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logoImg: {
    width: 240,
    height: 108,
    objectFit: "contain",
  },
  menuTitle: {
    fontFamily: "Anton",
    fontSize: 50,
    color: BLACK,
    letterSpacing: 2,
    lineHeight: 1,
  },

  // Divider
  divider: {
    height: 1.5,
    backgroundColor: BLACK,
    marginBottom: 5,
  },

  // Fila precio/calidad
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  priceText: {
    fontFamily: "Lora",
    fontSize: 13,
    color: GRAY70,
  },
  priceValue: {
    fontFamily: "Lora",
    fontSize: 13,
    fontWeight: "bold",
    color: BLACK,
  },

  // Título sección
  sectionTitle: {
    fontFamily: "Anton",
    fontSize: 34,
    color: BLACK,
    marginBottom: 10,
    letterSpacing: 0.5,
  },

  // Platos
  dishRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingLeft: 4,
  },
  dishBullet: {
    fontFamily: "Symbols",
    color: BLACK,
    marginRight: 10,
  },
  dishName: {
    fontFamily: "Lora",
    color: BLACK,
    flex: 1,
  },
  allergens: {
    fontFamily: "Lora",
    fontSize: 7,
    color: GRAY70,
    paddingLeft: 28,
    marginBottom: 4,
    fontStyle: "italic",
  },

  // Texto "qué incluye" — pie página Segundos (absoluto, no afecta al flujo)
  includesBlock: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    alignItems: "center",
  },
  includesText: {
    fontFamily: "Lora",
    fontSize: 7.5,
    color: GRAY70,
    textAlign: "center",
    lineHeight: 1.45,
  },

  // Barra negra footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: BLACK,
  },

  // ── Hoja cocina — vertical, letra grande ───────────────────
  kitchenPage: {
    flexDirection: "column",
    backgroundColor: WHITE,
    fontFamily: "Helvetica",
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 50,
  },
  kitchenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  kitchenTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: BLACK,
    letterSpacing: 2,
  },
  kitchenDate: {
    fontSize: 16,
    color: GRAY70,
  },
  kitchenDivider: {
    height: 3,
    backgroundColor: BLACK,
    marginBottom: 24,
  },
  kitchenSection: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: BLACK,
    marginBottom: 12,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  kitchenDishRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingLeft: 4,
  },
  kitchenBullet: {
    fontFamily: "Symbols",
    fontSize: 26,
    color: BLACK,
    marginRight: 14,
  },
  kitchenDish: {
    fontSize: 28,
    color: BLACK,
    flex: 1,
    lineHeight: 1.3,
  },
  kitchenGap: { height: 28 },
});

// ── Componentes ────────────────────────────────────────────────

const DIAMOND = "✦"; // U+2726 — renderizado con NotoSymbols

function DishEntry({ dish, fontSize, lineHeight }: { dish: MenuPdfDish; fontSize: number; lineHeight: number }) {
  return (
    <View>
      <View style={S.dishRow}>
        <Text style={[S.dishBullet, { fontSize }]}>{DIAMOND} </Text>
        <Text style={[S.dishName, { fontSize, lineHeight }]}>{dish.name}</Text>
      </View>
      {dish.allergens ? (
        <Text style={S.allergens}>Alérgenos: {dish.allergens}</Text>
      ) : null}
    </View>
  );
}

function KitchenDish({ dish }: { dish: MenuPdfDish }) {
  return (
    <View style={S.kitchenDishRow}>
      <Text style={S.kitchenBullet}>{DIAMOND}</Text>
      <Text style={S.kitchenDish}>{dish.name}</Text>
    </View>
  );
}

// ── Páginas ────────────────────────────────────────────────────

function HeaderBranding({ menuDateLong, menuTitle }: { menuDateLong: string; menuTitle: string }) {
  const showDate = menuTitle === "MENÚ DEL DÍA";
  return (
    <>
      <View style={S.header}>
        {/* Logo colores */}
        <Image src={LOGO_B64} style={S.logoImg} />
        {/* Título derecha */}
        <View style={{ alignItems: "flex-end" }}>
          <Text style={S.menuTitle}>{menuTitle}</Text>
          {showDate && (
            <Text style={{ fontFamily: "Lora", fontSize: 11, color: GRAY70, marginTop: 14 }}>
              {menuDateLong}
            </Text>
          )}
        </View>
      </View>
      <View style={S.divider} />
    </>
  );
}

function PriceRow({ price }: { price: string }) {
  return (
    <View style={S.priceRow}>
      <Text style={S.priceText}>Calidad al mejor precio</Text>
      <Text style={S.priceText}>
        Precio por menú{" "}
        <Text style={S.priceValue}>{price}</Text>
      </Text>
    </View>
  );
}

function PagePrimeros({ data }: { data: MenuPdfData }) {
  const dishes = [...data.firstCourses, ...data.otherDishes];
  const fs = dishFontSize(dishes.length);
  const lh = dishLineHeight(dishes.length);

  return (
    <Page size="A4" orientation="landscape" style={S.page}>
      {/* Watermark */}
      <Image src={FONDO_B64} style={S.watermark} />

      <HeaderBranding menuDateLong={data.menuDateLong} menuTitle={data.menuTitle} />
      <PriceRow price={data.priceFormatted} />

      <Text style={S.sectionTitle}>Primeros Platos</Text>
      {dishes.map((d, i) => (
        <DishEntry key={i} dish={d} fontSize={fs} lineHeight={lh} />
      ))}

      <View style={S.footer} />
    </Page>
  );
}

function PageSegundos({ data }: { data: MenuPdfData }) {
  const fs = dishFontSize(data.secondCourses.length);
  const lh = dishLineHeight(data.secondCourses.length);

  return (
    <Page size="A4" orientation="landscape" style={S.page}>
      {/* Watermark */}
      <Image src={FONDO_B64} style={S.watermark} />

      <HeaderBranding menuDateLong={data.menuDateLong} menuTitle={data.menuTitle} />
      <PriceRow price={data.priceFormatted} />

      <Text style={S.sectionTitle}>Segundos Platos</Text>
      {data.secondCourses.map((d, i) => (
        <DishEntry key={i} dish={d} fontSize={fs} lineHeight={lh} />
      ))}

      {/* Texto "qué incluye" centrado al pie */}
      <View style={S.includesBlock}>
        <Text style={S.includesText}>
          Se Incluye en el menú: 1º plato, 2º plato, Pan, 1 Bebida (Vino o Casera o Caña de Cerveza o Agua o Refresco Coca Cola, Fanta de Limón o de Naranja) Postre o Café (Postres: Preguntar al camarero){"\n"}
          En caso de consumir un único plato, se cobrará el menú completo ya que no disponemos de oferta para medio menú.{"\n"}
          Los platos de los menús, no se venden por separado.{"\n"}
          Los platos del menú se mantendrán hasta fin de existencias. En los menús incluye un pan y bebida por menú.
        </Text>
      </View>

      <View style={S.footer} />
    </Page>
  );
}

function PageCocina({ data }: { data: MenuPdfData }) {
  return (
    <Page size="A4" style={S.kitchenPage}>
      <View style={S.kitchenHeader}>
        <Text style={S.kitchenTitle}>COCINA — MENÚ DEL DÍA</Text>
        <Text style={S.kitchenDate}>{data.menuDate}</Text>
      </View>
      <View style={S.kitchenDivider} />

      {data.firstCourses.length > 0 && (
        <>
          <Text style={S.kitchenSection}>Primeros</Text>
          {data.firstCourses.map((d, i) => <KitchenDish key={i} dish={d} />)}
        </>
      )}
      {data.otherDishes.length > 0 && (
        <>
          {data.firstCourses.length > 0 && <View style={S.kitchenGap} />}
          <Text style={S.kitchenSection}>Otros</Text>
          {data.otherDishes.map((d, i) => <KitchenDish key={i} dish={d} />)}
        </>
      )}
      {data.secondCourses.length > 0 && (
        <>
          <View style={S.kitchenGap} />
          <Text style={S.kitchenSection}>Segundos</Text>
          {data.secondCourses.map((d, i) => <KitchenDish key={i} dish={d} />)}
        </>
      )}
    </Page>
  );
}

// ── Documento ──────────────────────────────────────────────────

function MenuDocument({ data }: { data: MenuPdfData }) {
  return (
    <Document
      title={`Menú del día — ${data.menuDate}`}
      author="Cruz Blanca Gestión"
      subject="Menú del día"
    >
      <PagePrimeros data={data} />
      <PageSegundos data={data} />
      <PageCocina data={data} />
    </Document>
  );
}

export async function generateMenuPdfBuffer(data: MenuPdfData): Promise<Buffer> {
  const buf = await renderToBuffer(<MenuDocument data={data} />);
  return Buffer.from(buf);
}
