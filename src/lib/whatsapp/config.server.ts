import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  localSetting,
  isLocalRequest,
  sameOrigin,
  saveLocalSettings,
} from "../assistant/local-config.server";
export const betaConfig = () => ({
  token: localSetting("WHATSAPP_ACCESS_TOKEN"),
  secret: localSetting("META_APP_SECRET"),
  verify: localSetting("WHATSAPP_VERIFY_TOKEN"),
  phoneId: localSetting("WHATSAPP_PHONE_NUMBER_ID") || "1287260894478658",
  flowId: localSetting("WHATSAPP_FLOW_ID") || "1746368663111217",
  recipient: localSetting("WHATSAPP_TEST_RECIPIENT"),
  enabled: localSetting("WHATSAPP_BETA_ENABLED") === "true",
  version: "v25.0",
});
export async function configureWhatsApp(request: Request) {
  if (!isLocalRequest(request) || (request.method === "POST" && !sameOrigin(request)))
    return Response.json({ error: "Solo en configuración local." }, { status: 403 });
  const c = betaConfig();
  if (request.method === "GET")
    return Response.json(
      {
        configured: !!(c.token && c.secret && c.verify && c.recipient),
        phoneId: c.phoneId,
        flowId: c.flowId,
        recipient: c.recipient,
        verifyToken: c.verify,
        callback: localSetting("WHATSAPP_CALLBACK_URL"),
        previousCallback: localSetting("WHATSAPP_PREVIOUS_CALLBACK_URL"),
        enabled: c.enabled,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  const schema = z
    .object({
      token: z.string().trim().min(30).max(2048),
      secret: z
        .string()
        .trim()
        .regex(/^[a-f0-9]{32}$/i),
      recipient: z.string().regex(/^[1-9]\d{7,14}$/),
      phoneId: z.string().regex(/^\d{8,30}$/),
      flowId: z.string().regex(/^\d{8,30}$/),
    })
    .strict();
  try {
    const text = await request.text();
    if (text.length > 4096) throw Error();
    const data = schema.parse(JSON.parse(text));
    await saveLocalSettings({
      WHATSAPP_ACCESS_TOKEN: data.token,
      META_APP_SECRET: data.secret,
      WHATSAPP_VERIFY_TOKEN: c.verify || randomBytes(24).toString("hex"),
      WHATSAPP_TEST_RECIPIENT: data.recipient,
      WHATSAPP_PHONE_NUMBER_ID: data.phoneId,
      WHATSAPP_FLOW_ID: data.flowId,
      WHATSAPP_BETA_ENABLED: "true",
    });
    return Response.json(
      {
        ok: true,
        message:
          "Credenciales de WhatsApp guardadas localmente. Falta verificar el webhook público en Meta.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Revisa los campos. No se guardó la configuración." },
      { status: 400 },
    );
  }
}
