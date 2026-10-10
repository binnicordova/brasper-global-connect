import { useEffect, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { validateProof } from "@/lib/transfers";
type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  name?: string;
};
export function ReceiptUpload({ file, onChange, disabled, name = "receipt" }: Props) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="receipt-upload">
      <label className="upload-proof">
        <Upload size={20} />
        <strong>{file ? "Cambiar comprobante" : "Elegir foto o PDF del comprobante"}</strong>
        <input
          name={name}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          disabled={disabled}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            setError("");
            if (selected) {
              try {
                validateProof(selected);
                onChange(selected);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Archivo no válido");
              }
            }
            e.target.value = "";
          }}
        />
        <small>Desde tu galería o tus archivos · JPG, PNG o PDF · hasta 5 MB</small>
      </label>
      {error && (
        <p role="alert" className="receipt-error">
          {error}
        </p>
      )}
      {file && (
        <div className="receipt-local-preview">
          {preview ? (
            <img src={preview} alt="Vista previa del comprobante seleccionado" />
          ) : (
            <FileText size={30} />
          )}
          <div>
            <strong>{file.name}</strong>
            <small>{Math.ceil(file.size / 1024)} KB · pendiente de enviar</small>
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-label="Quitar comprobante seleccionado"
            onClick={() => onChange(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
