export type Ambiente = "beta" | "produccion";
export type TipoComprobante = "01" | "03" | "07" | "08";
export type EstadoComprobante = "PENDIENTE" | "ACEPTADO" | "OBSERVADO" | "RECHAZADO" | "ERROR";

export interface LineaDetalle {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  unidadMedida: string;
  codigoProducto?: string;
  afectacionIgv: string;
  valorUnitario: number;
  tasaIgv?: number;
  igvLinea: number;
  totalLinea: number;
  valorVentaLinea?: number;
  valorUnitarioTexto?: string;
  precioUnitarioTexto?: string;
  cantidadTexto?: string;
}

export interface ReceptorData {
  tipoDoc: string; // "6"=RUC, "1"=DNI, "0"=varios
  numDoc: string;
  razonSocial: string;
  direccion?: string;
  email?: string;
}

export interface ComprobanteRef {
  tipoDoc: string;
  serie: string;
  correlativo: string;
  motivoCodigo: string;
  motivoDescripcion: string;
}

export interface TotalesData {
  valorVenta: number;
  totalIgv: number;
  totalVenta: number;
  descuentoGlobal?: number;
  otrosCargos?: number;
}

export interface ComprobanteInput {
  tipo: TipoComprobante;
  serie: string;
  correlativo: string;
  fechaEmision: string;
  moneda: string;
  receptor: ReceptorData;
  lineas: LineaDetalle[];
  totales: TotalesData;
  comprobanteRef?: ComprobanteRef;
  nota?: string;
}

export interface EmisorConfig {
  id?: string;
  ruc: string;
  razonSocial: string;
  direccionFiscal: string;
  certificadoBase64: string;
  certificadoClave: string;
  ambiente: Ambiente;
  apiKey: string;
  tasaIgv?: number;
  ubigeo?: string;
  codigoLocal?: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
  xmlFirmado?: string;
}

export interface SoapSendResult {
  success: boolean;
  cdrBase64?: string;
  sunatCode?: string;
  sunatDescription?: string;
  errorCode?:
    "SUNAT_TIMEOUT" | "SUNAT_CONNECTION_ERROR" | "SUNAT_REJECTION" | "INVALID_SUNAT_RESPONSE";
}

export interface ComprobanteRecord {
  id?: string;
  tipo: TipoComprobante;
  serie: string;
  correlativo: string;
  emisorRuc: string;
  receptorRuc?: string;
  receptorDni?: string;
  estado: EstadoComprobante;
  xmlFirmado: string;
  cdrBase64?: string;
  pdfBase64?: string;
  codigoError?: string;
  descripError?: string;
  fechaEmision: Date;
  payloadJson?: string;
  tipoEnvio?: string;
  resumenId?: string;
}

export interface ComprobanteFilters {
  tipo?: TipoComprobante;
  estado?: EstadoComprobante;
  fechaDesde?: Date;
  fechaHasta?: Date;
  receptorRuc?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogEntry {
  endpoint: string;
  method: string;
  ipOrigen: string;
  resultado: string;
  statusCode: number;
}
