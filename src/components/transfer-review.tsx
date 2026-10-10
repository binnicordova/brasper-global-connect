import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export type ReviewSubmission = {
  action: "verify" | "request_proof" | "payout" | "cancel" | "restore";
  note: string;
  reference?: string;
  payout?: File | undefined;
};

// Remount this component for each transfer/status so a previous review cannot
// become a different action when React replaces the available options.
export function TransferReview({
  id,
  status,
  busy,
  onReview,
}: {
  id: string;
  status: string;
  busy: boolean;
  onReview: (submission: ReviewSubmission) => Promise<boolean>;
}) {
  const [action, setAction] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const disabled = busy || pending;
  const restore = status === "cancelled";

  async function submit(e: FormEvent<HTMLFormElement>, special = false) {
    e.preventDefault();
    if (disabled || submitting.current) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const chosen = special ? (restore ? "restore" : "cancel") : action;
    const allowed = special
      ? confirming
      : (status === "proof_submitted" && ["verify", "request_proof"].includes(chosen)) ||
        (status === "verified" && chosen === "payout");
    if (!allowed || !form.reportValidity()) return;
    submitting.current = true;
    setPending(true);
    try {
      const file = data.get("payout");
      const saved = await onReview({
        action: chosen as ReviewSubmission["action"],
        note: String(data.get("note") || "").trim(),
        reference: String(data.get("reference") || "").trim(),
        payout: file instanceof File && file.size ? file : undefined,
      });
      if (saved) {
        form.reset();
        setAction("");
        setConfirming(false);
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <div>
      {["proof_submitted", "verified"].includes(status) && (
        <form className="portal-form review-form" onSubmit={(e) => void submit(e)}>
          <fieldset disabled={disabled} className="contents">
            <label>
              Acción
              <select
                name="action"
                required
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona una acción
                </option>
                {status === "proof_submitted" && (
                  <>
                    <option value="verify">Confirmar ingreso bancario</option>
                    <option value="request_proof">Solicitar otra prueba</option>
                  </>
                )}
                {status === "verified" && <option value="payout">Registrar dinero enviado</option>}
              </select>
            </label>
            <label>
              Observación
              <input
                name="note"
                required
                minLength={3}
                maxLength={1000}
                placeholder="Resultado de la verificación"
              />
            </label>
            {action === "payout" && (
              <>
                <label>
                  Referencia bancaria del envío
                  <input name="reference" required minLength={3} maxLength={200} />
                </label>
                <label>
                  Constancia de envío
                  <input
                    name="payout"
                    type="file"
                    required
                    accept="application/pdf,image/jpeg,image/png"
                  />
                </label>
              </>
            )}
            <Button type="submit" variant="brand" disabled={disabled || !action}>
              {pending ? "Guardando…" : "Guardar revisión"}
            </Button>
          </fieldset>
        </form>
      )}
      <div className="mt-4 border-t pt-4">
        <Button
          type="button"
          variant={restore ? "outline" : "destructive"}
          disabled={disabled}
          onClick={() => setConfirming(true)}
        >
          {restore ? "Restaurar ingreso confirmado" : "Cancelar operación…"}
        </Button>
      </div>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!submitting.current) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {restore
              ? "¿Restaurar el ingreso confirmado?"
              : "¿Seguro que deseas cancelar esta transferencia?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Operación {id}.{" "}
            {restore
              ? "Solo se restaurará si el historial confirma que se canceló después de verificar el ingreso y todavía no se ha registrado un envío."
              : "La operación dejará de estar disponible para registrar el envío. Esta acción no envía ni devuelve dinero."}
          </AlertDialogDescription>
          <form className="portal-form" onSubmit={(e) => void submit(e, true)}>
            <label>
              {restore ? "Motivo de restauración" : "Motivo de cancelación"}
              <input name="note" required minLength={3} maxLength={1000} disabled={disabled} />
            </label>
            <AlertDialogCancel type="button" disabled={disabled}>
              Volver sin cambios
            </AlertDialogCancel>
            <Button type="submit" variant={restore ? "brand" : "destructive"} disabled={disabled}>
              {pending
                ? "Guardando…"
                : restore
                  ? "Confirmar restauración"
                  : "Sí, cancelar esta operación"}
            </Button>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
