// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import {
  from64,
  to64,
  openEnvelope,
  sealResponse,
  sealGuest,
  openGuest,
  decryptMedia,
  trustedMediaUrl,
} from "../../supabase/functions/_shared/whatsapp-flow-crypto";
import {
  quoteFor,
  nativeTransferInput,
  transferArgs,
  collectStage,
  oneProof,
  renderFlow,
} from "../../supabase/functions/_shared/whatsapp-flow-model";
const secret = "test-only-native-flow-session-secret-32chars";
describe("Native Flow encrypted exchange", () => {
  it("decrypts Meta RSA/AES envelope and encrypts response with the inverted IV", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const aes = crypto.getRandomValues(new Uint8Array(16)),
      iv = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", aes, "AES-GCM", false, ["encrypt", "decrypt"]);
    const pub = await crypto.subtle.importKey(
      "spki",
      from64(publicKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
    const payload = { version: "3.0", action: "INIT", flow_token: "test-session" };
    const body = {
      encrypted_aes_key: to64(new Uint8Array(await crypto.subtle.encrypt("RSA-OAEP", pub, aes))),
      encrypted_flow_data: to64(
        new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(JSON.stringify(payload)),
          ),
        ),
      ),
      initial_vector: to64(iv),
    };
    const opened = await openEnvelope(body, privateKey);
    expect(opened.payload).toEqual(payload);
    const sealed = await sealResponse({ screen: "QUOTE" }, opened.key, opened.iv);
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.map((b) => b ^ 255) },
      key,
      from64(sealed),
    );
    expect(JSON.parse(new TextDecoder().decode(clear))).toEqual({ screen: "QUOTE" });
    await expect(
      openEnvelope({ ...body, encrypted_flow_data: to64(new Uint8Array(40)) }, privateKey),
    ).rejects.toThrow();
    expect(createPrivateKey(privateKey).asymmetricKeyType).toBe("rsa");
  });
  it("stores resumable guest credentials encrypted and bound to one Flow session", async () => {
    const value = { access_token: "synthetic-access", refresh_token: "synthetic-refresh" };
    const sealed = await sealGuest(value, secret, "session-a");
    expect(sealed).not.toContain(value.access_token);
    expect(await openGuest(sealed, secret, "session-a")).toEqual(value);
    await expect(openGuest(sealed, secret, "session-b")).rejects.toThrow();
    await expect(openGuest(sealed, secret + "wrong", "session-a")).rejects.toThrow();
  });
  it("validates media hashes and HMAC before decrypting; rejects foreign URLs and forged metadata", async () => {
    const clear = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array(32).fill(7)]),
      iv = crypto.getRandomValues(new Uint8Array(16));
    const aes = crypto.getRandomValues(new Uint8Array(32)),
      hm = crypto.getRandomValues(new Uint8Array(32));
    const aesKey = await crypto.subtle.importKey("raw", aes, "AES-CBC", false, ["encrypt"]);
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, clear),
    );
    const combined = new Uint8Array(iv.length + cipher.length);
    combined.set(iv);
    combined.set(cipher, iv.length);
    const hk = await crypto.subtle.importKey("raw", hm, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", hk, combined)).subarray(0, 10);
    const file = new Uint8Array(cipher.length + 10);
    file.set(cipher);
    file.set(sig, cipher.length);
    const hash = async (b: Uint8Array) =>
      to64(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(b))));
    const meta = {
      encryption_key: to64(aes),
      hmac_key: to64(hm),
      iv: to64(iv),
      encrypted_hash: await hash(file),
      plaintext_hash: await hash(clear),
    };
    const result = await decryptMedia(file, meta);
    expect(result.type).toBe("image/png");
    expect(result.bytes).toEqual(clear);
    await expect(
      decryptMedia(file, { ...meta, plaintext_hash: to64(new Uint8Array(32)) }),
    ).rejects.toThrow(/hash/);
    await expect(
      decryptMedia(file, { ...meta, hmac_key: to64(new Uint8Array(32)) }),
    ).rejects.toThrow(/authentication/);
    expect(trustedMediaUrl("https://mmg.whatsapp.net/v/media").hostname).toBe("mmg.whatsapp.net");
    for (const url of [
      "https://127.0.0.1/x",
      "https://mmg.whatsapp.net.evil.test/x",
      "http://mmg.whatsapp.net/x",
      "https://user:pass@mmg.whatsapp.net/x",
    ])
      expect(() => trustedMediaUrl(url)).toThrow();
  });
});
const data = {
  route: "PEN_BRL",
  rate_id: "00000000-0000-4000-8000-000000000010",
  amount: 300,
  customer_name: "Cliente de prueba",
  customer_document_type: "1",
  customer_document: "12345678",
  origin_bank: "Banco origen",
  funds_origin: "savings",
  funds_detail: "",
  transfer_purpose: "Apoyo familiar",
  recipient_relationship: "Familia",
  recipient_name: "Destinatario prueba",
  recipient_document: "12345678901",
  recipient_bank: "Banco destino",
  recipient_account_type: "pix",
  recipient_account: "test@example.test",
  recipient_account_holder: "Destinatario prueba",
  recipient_account_holder_document: "12345678901",
  recipient_bank_branch: "",
  recipient_phone: "",
  billing_type: "nfse",
  billing_legal_name: "Destinatario prueba",
  billing_document_type: "cpf",
  billing_document: "12345678901",
  billing_email: "client@example.test",
};
describe("Native Flow financial adapter", () => {
  it("preserves server quote and rejects invalid cents, limits and expiration", () => {
    const rate = {
      rate: 1.5,
      commission_percent: 3,
      min_amount: 10,
      max_amount: 1000,
      valid_until: "2030-01-01T00:00:00Z",
    };
    expect(quoteFor("300", rate, 0)).toEqual({ amount: 300, commission: 9, received: 436.5 });
    for (const amount of ["0", "1001", "1e2", "300.001", "NaN"])
      expect(() => quoteFor(amount, rate, 0)).toThrow();
    expect(() => quoteFor("300", rate, Date.parse(rate.valid_until))).toThrow();
  });
  it("uses the same validated input and binds the verified WhatsApp phone and Brazilian invoice", () => {
    const v = nativeTransferInput(data, "51999999999");
    const args = transferArgs(v);
    expect(args.p_customer_phone).toBe("+51999999999");
    expect(args.p_billing_type).toBe("nfse");
    expect(args.p_declaration_accepted).toBe(true);
    expect(() =>
      nativeTransferInput({ ...data, recipient_account_type: "cci" }, "51999999999"),
    ).toThrow();
    expect(() =>
      nativeTransferInput({ ...data, billing_email: "invalid" }, "51999999999"),
    ).toThrow();
  });
  it("routes destination soles to Peruvian receipts and binds boleta to the customer", () => {
    const peruvian = {
      ...data,
      route: "BRL_PEN",
      customer_document_type: "cpf",
      customer_document: "12345678901",
      recipient_document: "12345678",
      recipient_account_holder_document: "12345678",
      recipient_account_type: "cci",
      recipient_account: "12345678901234567890",
      billing_type: "boleta",
    };
    const boleta = transferArgs(nativeTransferInput(peruvian, "51999999999"));
    expect(boleta.p_billing_type).toBe("boleta");
    expect(boleta.p_billing_document_type).toBe("0");
    expect(boleta.p_billing_document).toBe(peruvian.customer_document);
    const factura = transferArgs(
      nativeTransferInput(
        {
          ...peruvian,
          billing_type: "factura",
          billing_legal_name: "Empresa prueba",
          billing_document: "20123456789",
        },
        "51999999999",
      ),
    );
    expect(factura.p_billing_document_type).toBe("6");
    expect(factura.p_billing_name).toBe("Empresa prueba");
  });
  it("prevents client injection of quote/auth state and requires exactly one attachment", () => {
    expect(
      collectStage("CUSTOMER", {
        customer_name: " Test ",
        rate_id: "attack",
        auth_cipher: "attack",
      }),
    ).not.toHaveProperty("rate_id");
    expect(collectStage("QUOTE", { amount: 300 })["amount"]).toBe("300");
    expect(renderFlow("QUOTE", { amount: "300" }).data["amount"]).toBe(300);
    expect(renderFlow("QUOTE", {}).data["amount"]).toBe(0);
    expect(() => oneProof({ photo_picker: [], document_picker: [] })).toThrow();
    expect(() => oneProof({ photo_picker: [{}], document_picker: [{}] })).toThrow();
    expect(oneProof({ photo_picker: [{ cdn_url: "test" }] })).toEqual({ cdn_url: "test" });
  });
  it("brands every native screen and includes working endpoint actions without a web iframe", () => {
    const flow = JSON.parse(readFileSync("public/whatsapp-flows/brasper-native.json", "utf8"));
    expect(flow.screens).toHaveLength(7);
    expect(flow.data_api_version).toBe("3.0");
    expect(flow.screens[0].data.amount.type).toBe("number");
    for (const screen of flow.screens) {
      const children = screen.layout.children;
      expect(children[0].type).toBe("Image");
      expect(from64(children[0].src).subarray(0, 8)).toEqual(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      const form = children.find((c: { type: string; label?: string }) => c.type === "Form");
      expect(form.children.at(-1)["on-click-action"].name).toBe("data_exchange");
      expect(
        form.children.filter((c: { type: string }) =>
          ["DocumentPicker", "PhotoPicker"].includes(c.type),
        ).length,
      ).toBeLessThanOrEqual(1);
      for (const c of form.children.filter(
        (c: { type: string; label?: string }) => c.type === "Dropdown",
      ))
        expect(c.label!.length).toBeLessThanOrEqual(20);
    }
    expect(JSON.stringify(flow)).not.toMatch(/iframe|ficticio|DEMO_NO_TRANSFERIR/);
    const payment = flow.screens
      .at(-1)
      .layout.children.find((c: { type: string; label?: string }) => c.type === "Form");
    expect(
      payment.children.some((c: { type: string; label?: string }) => c.type === "DocumentPicker"),
    ).toBe(true);
    expect(
      payment.children.find((c: { type: string }) => c.type === "DocumentPicker")[
        "min-uploaded-documents"
      ],
    ).toBe(1);
  });
});
