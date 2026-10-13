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
    <details className="demo-notice presentation-tools">
      <summary>Herramientas de presentación</summary>
      <span>Sesión de presentación con datos de prueba.</span>
      <nav aria-label="Herramientas de presentación">
        <Link to="/transferencias">Registrar cambio</Link>
        <a href="/demo/comprobante-ejemplo.pdf" download>
          Archivo de ejemplo
        </a>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("¿Reiniciar los datos de la presentación?")) resetDemo();
          }}
        >
          Reiniciar recorrido
        </button>
        <button type="button" onClick={exitDemo}>
          Salir de presentación
        </button>
      </nav>
    </details>
  );
}
