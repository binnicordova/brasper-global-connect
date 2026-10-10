import type { ComprobanteInput, LineaDetalle, TotalesData } from "../legacy-types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const tasaLinea = (linea: LineaDetalle, tasa = 18) =>
  linea.afectacionIgv === "10" ? (linea.tasaIgv ?? tasa) : 0;

export function calcularTotales(lineas: LineaDetalle[], tasa = 18): TotalesData {
  const valorVenta = round2(lineas.reduce((sum, l) => sum + l.valorUnitario * l.cantidad, 0));
  const totalIgv = round2(
    lineas.reduce((sum, l) => sum + (l.valorUnitario * l.cantidad * tasaLinea(l, tasa)) / 100, 0),
  );
  return { valorVenta, totalIgv, totalVenta: round2(valorVenta + totalIgv) };
}

export function normalizarComprobante(input: ComprobanteInput, tasa: number): ComprobanteInput {
  if ((input.totales?.descuentoGlobal ?? 0) || (input.totales?.otrosCargos ?? 0)) {
    throw Object.assign(
      new Error("Descuentos y cargos globales requieren distribución por línea"),
      { code: "UNSUPPORTED_ADJUSTMENT", statusCode: 400 },
    );
  }
  const lineas = input.lineas.map((l) => {
    const tasaIgv = tasaLinea(l, tasa);
    if (![0, 10, 10.5, 15, 18].includes(tasaIgv))
      throw Object.assign(new Error("Tasa de impuesto no admitida"), { statusCode: 400 });
    const valor = round2(l.valorUnitario * l.cantidad);
    const igvLinea = round2((valor * tasaIgv) / 100);
    return {
      ...l,
      tasaIgv,
      igvLinea,
      totalLinea: round2(valor + igvLinea),
      precioUnitario: round2(l.valorUnitario * (1 + tasaIgv / 100)),
    };
  });
  const valorVenta = round2(lineas.reduce((s, l) => s + round2(l.valorUnitario * l.cantidad), 0));
  const totalIgv = round2(lineas.reduce((s, l) => s + l.igvLinea, 0));
  const totales = { valorVenta, totalIgv, totalVenta: round2(valorVenta + totalIgv) };
  if (
    input.totales &&
    Object.entries(totales).some(
      ([k, v]) => Math.abs(v - input.totales[k as keyof TotalesData]!) > 0.011,
    )
  ) {
    throw Object.assign(
      new Error("Los totales recibidos no coinciden con el detalle y la tasa configurada"),
      { code: "INCONSISTENT_TOTALS", statusCode: 400 },
    );
  }
  return { ...input, lineas, totales };
}
