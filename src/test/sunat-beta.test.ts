// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createDemoFixtures } from "../lib/demo-fixtures";
import { BrasperBetaEngine } from "../lib/sunat/brasper-beta.server";
import { BetaTransport, BETA_ENDPOINT, parseBetaCdr } from "../lib/sunat/beta-transport";
import { XmlSigner } from "../lib/sunat/xml-signer";
import { TEST_CERTIFICATE_PEM } from "../lib/sunat/public-test-certificate";

describe("Brasper SUNAT beta boundaries", () => {
  it("builds a signed fictional Brasper invoice and test PDF", async () => {
    const prepared = await new BrasperBetaEngine().prepare(1, "2026-10-10");
    expect(prepared.fileName).toBe("20608550454-01-F902-1");
    expect(prepared.xml).toContain("CLIENTE DEMO BETA");
    expect(prepared.xml).toContain("SIN VALIDEZ TRIBUTARIA");
    expect(prepared.xml).not.toContain("10042049579");
    expect(new XmlSigner().verify(prepared.xml, TEST_CERTIFICATE_PEM)).toBe(true);
    expect(
      new XmlSigner().verify(
        prepared.xml.replace("CLIENTE DEMO BETA", "ALTERADO"),
        TEST_CERTIFICATE_PEM,
      ),
    ).toBe(false);
    expect(Buffer.from(prepared.pdfBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    await expect(new BrasperBetaEngine().prepare(0, "2026-10-10")).rejects.toThrow();
    await expect(new BrasperBetaEngine().prepare(1, "2026-02-30")).rejects.toThrow();
  });
  it("uses billing identity and commission from each operation, never the remittance principal", async () => {
    const operation = createDemoFixtures().transfers[4]!;
    const prepared = await new BrasperBetaEngine().prepare(9, "2026-10-12", "F902", operation);
    expect(prepared.xml).toContain(operation.billing_name!);
    expect(prepared.xml).toContain(operation.billing_document!);
    expect(prepared.xml).toContain(">31.05</cbc:PayableAmount>");
    expect(prepared.xml).not.toContain(">1500.00</cbc:PayableAmount>");
    const changed = await new BrasperBetaEngine().prepare(10, "2026-10-12", "F902", {
      ...operation,
      commission: 15,
    });
    expect(changed.xml).toContain(">10.35</cbc:PayableAmount>");
    expect(new XmlSigner().verify(changed.xml, TEST_CERTIFICATE_PEM)).toBe(true);
  });
  it("sends only once to beta and treats a timeout as uncertain", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("timeout");
    });
    const engine = new BrasperBetaEngine(new BetaTransport(fetcher));
    const result = await engine.send(await engine.prepare(2, "2026-10-10"));
    expect(result.estado).toBe("incierto");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(BETA_ENDPOINT);
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain("20608550454MODDATOS");
  });
  it("rejects CDRs for another invoice and XML entity expansion", async () => {
    const zip = new JSZip();
    zip.file(
      "cdr.xml",
      "<ApplicationResponse><Response><ResponseCode>0</ResponseCode><ReferenceID>F902-99</ReferenceID></Response></ApplicationResponse>",
    );
    await expect(
      parseBetaCdr(await zip.generateAsync({ type: "base64" }), "F902-1"),
    ).rejects.toThrow(/otro documento/);
    zip.file("cdr.xml", '<!DOCTYPE test [<!ENTITY x "test">]><ApplicationResponse/>');
    await expect(
      parseBetaCdr(await zip.generateAsync({ type: "base64" }), "F902-1"),
    ).rejects.toThrow(/XML no permitido/);
  });
});
