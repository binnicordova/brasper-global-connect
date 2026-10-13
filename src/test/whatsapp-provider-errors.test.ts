// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  MetaSendError,
  whatsappErrorCode,
  deliverNativeFlow,
} from "../../supabase/functions/_shared/whatsapp-errors";
it("preserves the integrity code without exposing raw provider data", () => {
  const error = new MetaSendError(400, {
    error: { code: 139000, error_subcode: 42, message: "secret-token customer-phone" },
  });
  expect(whatsappErrorCode(error)).toBe("meta_139000_42");
  expect(error.message).not.toMatch(/secret-token|customer-phone/);
  expect(whatsappErrorCode(new Error("private"))).toBe("processing_failed");
  expect(whatsappErrorCode(new MetaSendError(500, { error: { code: "secret" } }))).toBe(
    "processing_failed",
  );
});
it("notifies the customer when Meta blocks the native Flow and preserves the failure", async () => {
  const error = new MetaSendError(400, { error: { code: 139000 } });
  const deliver = vi.fn().mockRejectedValue(error),
    notify = vi.fn().mockResolvedValue("notice-id");
  await expect(deliverNativeFlow(deliver, notify)).rejects.toBe(error);
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("Meta está bloqueando"));
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("abrir web"));
});
it("keeps the original cause if Meta rejects both the Flow and the notice", async () => {
  const error = new MetaSendError(401, { error: { code: 190 } });
  await expect(
    deliverNativeFlow(
      () => Promise.reject(error),
      () => Promise.reject(new Error("second error")),
    ),
  ).rejects.toBe(error);
});
it("does not send a failure notice for an accepted Flow", async () => {
  const notify = vi.fn();
  await deliverNativeFlow(() => Promise.resolve("flow-id"), notify);
  expect(notify).not.toHaveBeenCalled();
});
