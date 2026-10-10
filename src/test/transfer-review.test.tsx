import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransferReview } from "@/components/transfer-review";

afterEach(cleanup);
const id = "542a4283-0000-4000-8000-000000000001";

describe("Staff transfer review safety", () => {
  it("clears the previous action and note after verification and requires a new choice", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <TransferReview
        key={`${id}:proof_submitted`}
        id={id}
        status="proof_submitted"
        busy={false}
        onReview={save}
      />,
    );
    expect(screen.getByRole("button", { name: "Guardar revisión" })).toBeDisabled();
    expect(screen.queryByRole("option", { name: "Cancelar operación" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "verify" } });
    fireEvent.change(screen.getByLabelText("Observación"), { target: { value: "tofo bin" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));
    await waitFor(() => expect(screen.getByLabelText("Observación")).toHaveValue(""));
    rerender(
      <TransferReview
        key={`${id}:verified`}
        id={id}
        status="verified"
        busy={false}
        onReview={save}
      />,
    );
    expect(screen.getByLabelText("Acción")).toHaveValue("");
    expect(screen.getByLabelText("Observación")).toHaveValue("");
    fireEvent.submit(screen.getByLabelText("Acción").closest("form")!);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ action: "verify", note: "tofo bin" });
  });

  it("opening or dismissing cancellation never submits; only explicit confirmation does", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<TransferReview id={id} status="verified" busy={false} onReview={save} />);
    fireEvent.change(screen.getByLabelText("Observación"), { target: { value: "tofo bin" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar operación…" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo de cancelación")).toHaveValue("");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Volver sin cambios" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar operación…" }));
    fireEvent.change(screen.getByLabelText("Motivo de cancelación"), {
      target: { value: "Cliente solicita cancelar" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar esta operación" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      action: "cancel",
      note: "Cliente solicita cancelar",
    });
  });

  it("blocks duplicate submissions while pending and preserves data when saving fails", async () => {
    let finish!: (ok: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(<TransferReview id={id} status="proof_submitted" busy={false} onReview={save} />);
    fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "verify" } });
    fireEvent.change(screen.getByLabelText("Observación"), { target: { value: "Banco revisado" } });
    const form = screen.getByLabelText("Acción").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(save).toHaveBeenCalledTimes(1);
    finish(false);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar revisión" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Observación")).toHaveValue("Banco revisado");
    expect(screen.getByLabelText("Acción")).toHaveValue("verify");
  });

  it("requires payout evidence and bank reference; cancellation does not require payout evidence", () => {
    render(<TransferReview id={id} status="verified" busy={false} onReview={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Acción"), { target: { value: "payout" } });
    expect(screen.getByLabelText("Constancia de envío")).toBeRequired();
    expect(screen.getByLabelText("Referencia bancaria del envío")).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar operación…" }));
    expect(
      screen
        .getByLabelText("Motivo de cancelación")
        .closest("form")
        ?.querySelector('[name="payout"]'),
    ).toBeNull();
  });
});
