import { useEffect, useState } from "react";
import { isDemoEnabled, resetDemo, exitDemo } from "@/lib/demo-supabase";
export function DemoNotice() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(isDemoEnabled()), []);
  if (!visible) return null;
  return (
    <div className="demo-notice">
      <strong>DEMO · Datos sintéticos</strong>
      <span>Transferencias, facturación y correos simulados en este navegador.</span>
      <nav aria-label="Acciones de demostración">
        <a href="/transferencias?demo=1">Registrar cambio</a>
        <a href="/dashboard?demo=1">Ver dashboard</a>
        <a href="/demo/comprobante-ejemplo.pdf" download>
          Archivo de ejemplo
        </a>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("¿Reiniciar únicamente los datos sintéticos de esta demo?"))
              resetDemo();
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
