// Setup global para tests de unidad (Vitest)
// No importar módulos que requieran conexión a BD aquí

import { vi } from "vitest";

// Suprimir logs de consola en tests (opcional)
vi.spyOn(console, "error").mockImplementation(() => {});
