import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isDemoEnabled, resetDemo, exitDemo } from "@/lib/demo-supabase";
export function DemoNotice() {
  const [visible, setVisible] = useState(false);
  useEffect(
    () =>
      setVisible(
        isDemoEnabled() &&
          !(
            window.self !== window.top &&
            new URLSearchParams(window.location.search).get("embed") === "1"
          ),
      ),
    [],
  );
  if (!visible) return null;
  return (
    <div className="demo-notice">
      <strong>Modo demo</strong>
      <span>
        Prueba el registro, la revisión y la facturación. Sin movimientos ni envíos reales.
      </span>
      <nav aria-label="Acciones de demostración">
        <Link to="/transferencias">Registrar cambio</Link>
        <Link to="/dashboard">Ver dashboard</Link>
        <a href="/demo/comprobante-ejemplo.pdf" download>
          Archivo de ejemplo
        </a>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("¿Reiniciar los datos de esta demo?")) resetDemo();
          }}
        >
          Reiniciar demo
        </button>
        <button type="button" onClick={exitDemo}>
          Salir de demo
        </button>
      </nav>
    </div>
  );
}
