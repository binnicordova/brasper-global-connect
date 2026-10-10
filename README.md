# Brasper Global Connect

Crea una landing page moderna, minimalista y responsiva para Brasper (transferencias internacionales entre Perú, Brasil y EE. UU.). Debe incluir: 

1. Una sección principal (Hero) con un título llamativo enfocado en envíos seguros en minutos, un calculador rápido de divisas y un botón de llamada a la acción (CTA) para WhatsApp.

2. Una sección de características clave con iconos (más de 50 mil envíos, transacciones seguras, atención bilingüe, mejor tasa del mercado).

3. Una sección de bancos asociados (BCP, Banco do Brasil, NuBank, C6 Bank) y pruebas de confianza de su trayectoria.

4. Un formulario de contacto e información en el pie de página. 

Usa una paleta de colores moderna con tonos corporativos (azules profundos) y acentos vibrantes.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3238d75c-acc7-415b-889e-3acc9f1100b6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Transferencias y revisión interna

El portal `/transferencias` incorpora solicitudes, carga privada de pruebas de pago, revisión de ingreso, registro manual de envío y cola de facturación. Sigue [la guía de activación](docs/TRANSFER_WORKFLOW.md) para configurar Supabase, tasas, cuentas, roles y proveedor fiscal. Sin esas credenciales el portal informa que está en preparación; no simula pagos ni emisión SUNAT.

Para configurar desde Lovable, usa el [prompt de activación](docs/PROMPT_LOVABLE.md). La [plantilla SQL comentada](supabase/manual-setup.example.sql) describe los datos oficiales que debe cargar el administrador.

El equipo dispone de `/dashboard` con cola de operaciones, totales del historial por moneda y seguimiento de la puesta en marcha desde `MASTER_PLAN.json`. Requiere la segunda migración y un usuario autorizado en `staff_members`.
