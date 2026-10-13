// @vitest-environment node
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../../supabase/functions/_shared/whatsapp-token";
import { hostedWhatsappToken } from "../lib/hosted-whatsapp";
const secret = "test-only-signing-secret-32-characters-long";
const session = { id: "00000000-0000-4000-8000-000000000001", expires_at: "2030-01-01T00:00:00Z" };
describe("Hosted WhatsApp access", () => {
  it("opens the cloud path for the exact signed token, preserving the identifier", async () => {
    const token = await signSession(session, secret);
    expect(hostedWhatsappToken("?embed=1&wa=" + encodeURIComponent(token))).toBe(token);
    expect(await verifySession(token, secret, 0)).toBe(session.id);
    expect(hostedWhatsappToken("?wa=legacy-local-token")).toBeNull();
  });
  it("rejects a tampered identifier or signature and an expired token", async () => {
    const token = await signSession(session, secret);
    await expect(
      verifySession(token.replace(session.id, "00000000-0000-4000-8000-000000000002"), secret, 0),
    ).rejects.toThrow();
    await expect(
      verifySession(token, "different-test-secret-32-characters-long", 0),
    ).rejects.toThrow();
    await expect(verifySession(token, secret, Date.parse(session.expires_at))).rejects.toThrow();
    expect(hostedWhatsappToken("?wa=" + token + ".extra")).toBeNull();
  });
  it("refuses signing or validating without a strong configured secret", async () => {
    await expect(signSession(session, "")).rejects.toThrow();
    const token = await signSession(session, secret);
    await expect(verifySession(token, "", 0)).rejects.toThrow();
  });
});
