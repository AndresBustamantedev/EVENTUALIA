/**
 * Constantes de eventos auditados.
 * Usar SIEMPRE estas constantes en AuditService.log()
 * para garantizar consistencia y facilitar búsquedas.
 */

// ── AUTENTICACIÓN ────────────────────────────────────────────
export const AUDIT_USER_LOGIN = "USER_LOGIN";
export const AUDIT_USER_LOGIN_FAILED = "USER_LOGIN_FAILED";
export const AUDIT_USER_LOGIN_LOCKED = "USER_LOGIN_LOCKED";
export const AUDIT_USER_LOGOUT = "USER_LOGOUT";
export const AUDIT_PASSWORD_CHANGED = "PASSWORD_CHANGED";
export const AUDIT_PASSWORD_RESET = "PASSWORD_RESET";

// ── USUARIOS ─────────────────────────────────────────────────
export const AUDIT_USER_CREATED = "USER_CREATED";
export const AUDIT_USER_UPDATED = "USER_UPDATED";
export const AUDIT_USER_DEACTIVATED = "USER_DEACTIVATED";
export const AUDIT_USER_ACTIVATED = "USER_ACTIVATED";

// ── EMPLEADOS (Fase 2) ───────────────────────────────────────
export const AUDIT_EMPLOYEE_CREATED = "EMPLOYEE_CREATED";
export const AUDIT_EMPLOYEE_UPDATED = "EMPLOYEE_UPDATED";
export const AUDIT_EMPLOYEE_ARCHIVED = "EMPLOYEE_ARCHIVED";
export const AUDIT_EMPLOYEE_DATA_ACCESSED = "EMPLOYEE_DATA_ACCESSED";

// ── CONTRATOS (Fase 2) ───────────────────────────────────────
export const AUDIT_CONTRACT_CREATED = "CONTRACT_CREATED";

// ── HORARIOS (Fase 2A) ────────────────────────────────────────
export const AUDIT_SCHEDULE_CREATED = "SCHEDULE_CREATED";

// ── REGISTROS DE JORNADA (Fase 2) ────────────────────────────
export const AUDIT_TIME_RECORD_CREATED = "TIME_RECORD_CREATED";
export const AUDIT_TIME_RECORD_CLOSED = "TIME_RECORD_CLOSED";
export const AUDIT_TIME_RECORD_REOPENED = "TIME_RECORD_REOPENED";

// ── DOCUMENTOS (Fase 2) ──────────────────────────────────────
export const AUDIT_DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED";
export const AUDIT_DOCUMENT_DOWNLOADED = "DOCUMENT_DOWNLOADED";
export const AUDIT_DOCUMENT_DELETED = "DOCUMENT_DELETED";

// ── MENÚ (Fase 3) ────────────────────────────────────────────
export const AUDIT_MENU_CREATED = "MENU_CREATED";
export const AUDIT_MENU_PDF_GENERATED = "MENU_PDF_GENERATED";
