import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
export function EvidenceDetails({
  path,
  label,
  summary,
}: {
  path: string;
  label: string;
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="operation-evidence" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {open && <EvidencePreview path={path} label={label} />}
    </details>
  );
}
export function EvidencePreview({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    async function sign() {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.storage
          .from("transfer-proofs")
          .createSignedUrl(path, 60);
        if (!active) return;
        if (error) {
          setError("No pudimos abrir el archivo. Comprueba tus permisos e intenta de nuevo.");
          setUrl("");
        } else {
          setUrl(data.signedUrl);
          setError("");
        }
      } catch {
        if (active) setError("No pudimos cargar el comprobante.");
      }
    }
    void sign();
    const timer = window.setInterval(() => void sign(), 45000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [path, version]);
  return (
    <figure className="evidence-preview">
      <figcaption>
        <FileText size={16} />
        {label}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setVersion((v) => v + 1)}
          aria-label={`Actualizar ${label}`}
        >
          <RefreshCw size={14} />
        </Button>
      </figcaption>
      {error ? (
        <p role="alert">{error}</p>
      ) : !url ? (
        <p role="status">Cargando archivo privado…</p>
      ) : /\.(png|jpe?g)$/i.test(path) ? (
        <img
          src={url}
          alt={label}
          onError={() =>
            setError("No se pudo mostrar la imagen. Actualiza el enlace para volver a intentar.")
          }
        />
      ) : (
        <object data={url} type="application/pdf" aria-label={label}>
          <p>Abre el PDF para consultar el comprobante.</p>
        </object>
      )}
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          Abrir archivo a tamaño completo
        </a>
      )}
    </figure>
  );
}
