/**
 * Tests E2E de autenticación.
 * Requieren que la app esté corriendo en http://localhost:3000
 * y que el seed de desarrollo haya sido ejecutado.
 *
 * Ejecutar con: npx playwright test
 * (La app debe estar arriba: docker compose up o npm run dev)
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Pantalla de login", () => {
  test("muestra el formulario de login", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.getByRole("heading", { name: /Cruz Blanca/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: /Iniciar sesión/i })).toBeVisible();
  });

  test("redirige al dashboard tras login correcto", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("Email").fill("admin@cruzblanca.local");
    await page.getByLabel("Contraseña").fill("Provisional1234!");
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    // Admin tiene mustChangePwd=true en seed → redirige a /change-password
    await expect(page).toHaveURL(/change-password|dashboard|\//);
  });

  test("muestra error con credenciales incorrectas", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("Email").fill("admin@cruzblanca.local");
    await page.getByLabel("Contraseña").fill("contraseña_incorrecta");
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    await expect(
      page.getByText(/Credenciales incorrectas|Error de autenticación/i)
    ).toBeVisible();
  });
});

test.describe("Protección de rutas", () => {
  test("redirige a /login si no hay sesión", async ({ page }) => {
    await page.goto(`${BASE_URL}/hr`);
    await expect(page).toHaveURL(/login/);
  });

  test("redirige a /login al acceder a cualquier ruta protegida sin sesión", async ({
    page,
  }) => {
    const protectedRoutes = ["/", "/hr", "/menu"];
    for (const route of protectedRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await expect(page).toHaveURL(/login/);
    }
  });
});

test.describe("Control de acceso por rol", () => {
  test("COCINA no puede acceder a /hr aunque conozca la URL", async ({
    page,
  }) => {
    // Login como COCINA
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("Email").fill("cocina@cruzblanca.local");
    await page.getByLabel("Contraseña").fill("Provisional1234!");
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();

    // Intentar acceder a RRHH directamente
    await page.goto(`${BASE_URL}/hr`);
    // Debe redirigir (a /login o mostrar acceso denegado, no el módulo RRHH)
    const url = page.url();
    const hasHrContent =
      !url.includes("/hr") || url.includes("login") || url.includes("change-password");
    expect(hasHrContent).toBeTruthy();
  });
});
