// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  settings: {
    WHATSAPP_ACCESS_TOKEN: "test-access-token-kept-with-sufficient-length",
    META_APP_SECRET: "a".repeat(32),
    WHATSAPP_VERIFY_TOKEN: "test-only-verification",
    WHATSAPP_TEST_RECIPIENT: "51999999999",
    WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
    WHATSAPP_FLOW_ID: "987654321098765",
  } as Record<string, string>,
}));
vi.mock("../assistant/local-config.server", () => ({
  localSetting: (name: string) => mock.settings[name] || "",
  isLocalRequest: () => true,
  sameOrigin: () => true,
  saveLocalSettings: mock.save,
}));
import { configureWhatsApp } from "./config.server";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mock.save.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
function req(token = "", secret = "") {
  return new Request("http://127.0.0.1:8692/api/whatsapp-setup", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:8692", "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      secret,
      recipient: "51999999999",
      phoneId: "123456789012345",
      flowId: "987654321098765",
    }),
  });
}
it("leaving password fields empty preserves saved credentials without exposing them", async () => {
  const res = await configureWhatsApp(req());
  expect(res.status).toBe(200);
  expect(mock.save).toHaveBeenCalledOnce();
  const values = mock.save.mock.calls[0]![0];
  expect(values).not.toHaveProperty("WHATSAPP_ACCESS_TOKEN");
  expect(values).not.toHaveProperty("META_APP_SECRET");
  expect(fetchMock).not.toHaveBeenCalled();
  const status = await (
    await configureWhatsApp(new Request("http://127.0.0.1:8692/api/whatsapp-setup"))
  ).json();
  expect(status.hasToken).toBe(true);
  expect(status.hasAppSecret).toBe(true);
  expect(status).not.toHaveProperty("token");
  expect(status).not.toHaveProperty("secret");
});
it("renews only the access token after confirming the assigned phone number", async () => {
  fetchMock.mockResolvedValue(Response.json({ id: "123456789012345" }));
  const token = "test-only-new-access-token-with-sufficient-length";
  const res = await configureWhatsApp(req(token));
  expect(res.status).toBe(200);
  expect(mock.save.mock.calls[0]![0]).toHaveProperty("WHATSAPP_ACCESS_TOKEN", token);
  expect(mock.save.mock.calls[0]![0]).not.toHaveProperty("META_APP_SECRET");
});
it("rejects a mismatched app secret before writing any local value", async () => {
  fetchMock.mockResolvedValue(Response.json({ error: { code: 190 } }, { status: 400 }));
  const res = await configureWhatsApp(req("", "b".repeat(32)));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/secreto no coincide/);
  expect(mock.save).not.toHaveBeenCalled();
});
it("rejects a token belonging to another phone number without replacing credentials", async () => {
  fetchMock.mockResolvedValue(Response.json({ id: "999999999999999" }));
  const res = await configureWhatsApp(req("test-only-token-for-another-phone-number"));
  expect(res.status).toBe(400);
  expect(mock.save).not.toHaveBeenCalled();
});
