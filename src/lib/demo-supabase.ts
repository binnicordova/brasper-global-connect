import {
  STAFF,
  CLIENT,
  createDemoFixtures,
  demoRates,
  type DemoState as State,
} from "./demo-fixtures";
type DemoTransfer = State["transfers"][number];
import type { SavedRecipient } from "./saved-recipients";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recipientDetailsInput, quoteAmounts, validateProof, type Transfer } from "./transfers";

const STORE = "brasper-synthetic-demo-v1";
const now = () => new Date().toISOString();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function isDemoEnabled() {
  if (typeof window === "undefined") return false;
  const flag = new URLSearchParams(window.location.search).get("demo");
  if (flag === "1") sessionStorage.setItem("brasper-demo", "1");
  return sessionStorage.getItem("brasper-demo") === "1";
}
export function exitDemo() {
  sessionStorage.removeItem("brasper-demo");
  window.location.assign("/");
}
export function resetDemo() {
  localStorage.removeItem(STORE);
  indexedDB.deleteDatabase("brasper-demo-files");
  window.location.assign("/dashboard?demo=1");
}

function read(): State {
  const saved = localStorage.getItem(STORE);
  if (saved) {
    try {
      const state: State = JSON.parse(saved);
      const fixtures = createDemoFixtures();
      // Refresh only cosmetic fields of known seed records; preserve actions and files.
      for (const t of state.transfers) {
        const fixture = fixtures.transfers.find((f) => f.id === t.id);
        if (!fixture || !t.customer_name.startsWith("Cliente Demo ")) continue;
        for (const key of [
          "customer_name",
          "billing_name",
          "recipient_name",
          "recipient_account_holder",
          "recipient_bank",
          "origin_bank",
          "funds_detail",
          "demo_meta",
          "deposit_instructions",
        ] as const) {
          Object.assign(t, { [key]: fixture[key] });
        }
      }
      return state;
    } catch {
      /* Reset damaged demo data only. */
    }
  }
  const state = createDemoFixtures();
  write(state);
  return state;
}
function write(state: State) {
  localStorage.setItem(STORE, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("brasper-demo-change"));
}
async function fileStore(bucket: string, path: string, file?: Blob): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("brasper-demo-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(new Error("No se pudo abrir el almacenamiento de la demo"));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("files", file ? "readwrite" : "readonly");
      const store = transaction.objectStore("files");
      const op = file ? store.put(file, `${bucket}/${path}`) : store.get(`${bucket}/${path}`);
      let result: Blob | undefined;
      op.onsuccess = () => {
        result = file || op.result;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(new Error("No se pudo guardar el archivo de la demo"));
      };
    };
  });
}
async function demoPdf(t: Transfer, number?: string, issuedAt?: string) {
  const { buildDemoReceipt } = await import("../../supabase/functions/_shared/demo-receipt");
  const invoice = t.invoices?.[0];
  const bytes = await buildDemoReceipt(
    t,
    number || invoice?.number || `VP-${t.id.slice(0, 8)}`,
    issuedAt || invoice?.demo_delivered_at || t.payout_at || t.created_at,
  );
  return new Blob([bytes], { type: "application/pdf" });
}
const placeholder = () =>
  new Blob(
    [
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#eef3fb"/><text x="300" y="170" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#284677">Constancia de ingreso</text><text x="300" y="210" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#61708a">Archivo de ejemplo - entorno de pruebas</text></svg>',
    ],
    { type: "image/svg+xml" },
  );

export function createDemoClient(): SupabaseClient {
  let staff =
    window.location.pathname === "/dashboard" || /^#operacion-/.test(window.location.hash);
  let signedIn = true;
  let registered = sessionStorage.getItem("brasper-demo-registered") === "1";
  const listeners = new Set<(event: string, session: unknown) => void>();
  const uid = () => (staff ? STAFF : CLIENT);
  const user = () =>
    signedIn
      ? {
          id: uid(),
          email: staff ? "equipo@example.test" : registered ? "cliente@example.test" : undefined,
          is_anonymous: !staff && !registered,
        }
      : null;
  const session = () =>
    signedIn
      ? {
          user: user(),
          access_token: "synthetic-demo",
          refresh_token: "synthetic-demo",
          token_type: "bearer",
          expires_in: 3600,
        }
      : null;
  const authChanged = () => listeners.forEach((fn) => fn("SIGNED_IN", session()));
  const success = (data: unknown = null) => ({ data, error: null });
  const rates = demoRates;
  const event = (state: State, t: Transfer, action: string, note = "") =>
    state.events.unshift({ transfer_id: t.id, action, note, created_at: now() });
  const urls = new Set<string>();
  const client = {
    auth: {
      getSession: async () => {
        staff =
          window.location.pathname === "/dashboard" || /^#operacion-/.test(window.location.hash);
        return success({ session: session() });
      },
      getUser: async () => success({ user: user() }),
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        listeners.add(fn);
        return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
      },
      signInAnonymously: async () => {
        staff = false;
        registered = false;
        sessionStorage.removeItem("brasper-demo-registered");
        signedIn = true;
        authChanged();
        return success({ session: session(), user: user() });
      },
      signInWithPassword: async () => {
        registered = true;
        sessionStorage.setItem("brasper-demo-registered", "1");
        signedIn = true;
        authChanged();
        return success({ session: session(), user: user() });
      },
      signUp: async () => success({ session: session(), user: user() }),
      updateUser: async () => success({ user: user() }),
      signInWithOtp: async () => success(),
      signOut: async () => {
        signedIn = false;
        authChanged();
        return success();
      },
    },
    from: (table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let start = 0;
      let end = Infinity;
      let sort = "";
      let ascending = false;
      const get = (row: Record<string, unknown>, column: string): unknown =>
        column === "invoices.status"
          ? ((row["invoices"] as { status: string }[]) || []).map((i) => i.status)
          : row[column];
      const run = () => {
        const state = read();
        let rows: Record<string, unknown>[] = [];
        if (table === "staff_members") rows = staff ? [{ user_id: STAFF }] : [];
        if (table === "fx_rates") rows = rates();
        if (table === "saved_recipients" && (registered || staff))
          rows = (state.savedRecipients || []).filter(
            (a) => a.user_id === uid(),
          ) as unknown as Record<string, unknown>[];
        if (table === "transfers")
          rows = state.transfers.filter((t) => staff || t.user_id === CLIENT) as unknown as Record<
            string,
            unknown
          >[];
        if (table === "transfer_events")
          rows = state.events.filter(
            (e) =>
              staff || state.transfers.some((t) => t.id === e.transfer_id && t.user_id === CLIENT),
          ) as unknown as Record<string, unknown>[];
        rows = rows.filter((r) => filters.every((fn) => fn(r)));
        const count = rows.length;
        if (sort)
          rows.sort(
            (a, b) => String(a[sort]).localeCompare(String(b[sort])) * (ascending ? 1 : -1),
          );
        return { data: copy(rows.slice(start, end + 1)), count, error: null };
      };
      const query = {
        select: () => query,
        returns: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((r) => get(r, key) === value);
          return query;
        },
        gt: (key: string, value: unknown) => {
          filters.push((r) => String(get(r, key)) > String(value));
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((r) =>
            Array.isArray(get(r, key))
              ? (get(r, key) as unknown[]).some((v) => values.includes(v))
              : values.includes(get(r, key)),
          );
          return query;
        },
        ilike: (key: string, value: string) => {
          filters.push((r) =>
            String(get(r, key) || "")
              .toLowerCase()
              .includes(value.replace(/%/g, "").toLowerCase()),
          );
          return query;
        },
        order: (key: string, opts?: { ascending?: boolean }) => {
          if (!sort) {
            sort = key;
            ascending = opts?.ascending === true;
          }
          return query;
        },
        limit: (n: number) => {
          end = n - 1;
          return query;
        },
        range: (a: number, b: number) => {
          start = a;
          end = b;
          return query;
        },
        maybeSingle: async () => {
          const result = run();
          return { ...result, data: result.data[0] || null };
        },
        then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve().then(run).then(resolve, reject),
      };
      return query;
    },
    rpc: async (name: string, params: Record<string, unknown> = {}) => {
      const p = Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, String(value ?? "")]),
      ) as Record<string, string>;
      try {
        if (!signedIn) throw new Error("Sesión demo requerida");
        const state = read();
        if (name === "verify_transfer_contact") return success();
        if (name === "delete_saved_recipient") {
          if (!registered && !staff) throw new Error("Inicia sesión con una cuenta registrada");
          const old = state.savedRecipients || [];
          state.savedRecipients = old.filter((a) => a.id !== p["p_id"] || a.user_id !== uid());
          write(state);
          return success(old.length !== state.savedRecipients.length);
        }
        if (name === "save_transfer_recipient") {
          if (!registered && !staff) throw new Error("Inicia sesión con una cuenta registrada");
          const transfer = state.transfers.find(
            (t) => t.id === p["p_transfer_id"] && t.user_id === uid(),
          );
          if (!transfer) throw new Error("Operación no disponible");
          const label = p["p_label"]?.trim() || "";
          if (label.length < 2 || label.length > 80)
            throw new Error("Indica un nombre para la cuenta (2 a 80 caracteres)");
          const accounts = (state.savedRecipients ||= []);
          const existing = accounts.find(
            (a) =>
              a.user_id === uid() &&
              a.currency === transfer.to_currency &&
              a.recipient_account_type === transfer.recipient_account_type &&
              a.recipient_bank === transfer.recipient_bank &&
              a.recipient_account === transfer.recipient_account,
          );
          if (!existing && accounts.filter((a) => a.user_id === uid()).length >= 50)
            throw new Error("Puedes guardar hasta 50 cuentas");
          const account: SavedRecipient = {
            id: existing?.id || crypto.randomUUID(),
            user_id: uid(),
            label,
            currency: transfer.to_currency,
            country: transfer.to_currency === "PEN" ? "PE" : "BR",
            recipient_name: transfer.recipient_name,
            recipient_document: transfer.recipient_document,
            recipient_bank: transfer.recipient_bank,
            recipient_account: transfer.recipient_account,
            recipient_account_type: transfer.recipient_account_type || "bank_account",
            recipient_account_holder: transfer.recipient_account_holder || "",
            recipient_account_holder_document: transfer.recipient_account_holder_document || "",
            recipient_bank_branch: transfer.recipient_bank_branch || "",
            recipient_phone: transfer.recipient_phone || "",
            recipient_relationship: transfer.recipient_relationship || "",
          };
          if (existing) Object.assign(existing, account);
          else accounts.unshift(account);
          write(state);
          return success(account.id);
        }
        if (name === "staff_dashboard_summary") {
          if (!staff) throw new Error("Solo el equipo demo puede consultar el dashboard");
          const statuses: Record<string, number> = {},
            invoices: Record<string, number> = {},
            amounts: Record<string, { currency: string; amount: number; operations: number }> = {};
          state.transfers.forEach((t) => {
            statuses[t.status] = (statuses[t.status] || 0) + 1;
            t.invoices.forEach((i) => {
              invoices[i.status] = (invoices[i.status] || 0) + 1;
            });
            if (t.status !== "cancelled") {
              const a = (amounts[t.from_currency] ??= {
                currency: t.from_currency,
                amount: 0,
                operations: 0,
              });
              a.amount += t.amount;
              a.operations++;
            }
          });
          return success({ statuses, invoices, amounts: Object.values(amounts) });
        }
        if (name === "create_validated_transfer") {
          const input = Object.fromEntries(
            Object.entries(p).map(([key, value]) => [
              key
                .replace(/^p_/, "")
                .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
              value,
            ]),
          );
          recipientDetailsInput.parse({
            ...input,
            billingRuc: p["p_billing_type"]! !== "boleta" ? p["p_billing_document"]! : "",
            billingLegalName: p["p_billing_name"]!,
          });
          if (p["p_declaration_accepted"]! !== "true")
            throw new Error("Confirma la declaración de fondos");
          const rate = rates().find((r) => r.id === p["p_rate_id"]!);
          if (
            !rate ||
            Number(p["p_amount"]) < rate.min_amount ||
            Number(p["p_amount"]) > rate.max_amount
          )
            throw new Error("Monto o cotización no válida");
          if (
            (rate.from_currency === "PEN" && p["p_source_country"] !== "PE") ||
            (rate.to_currency === "PEN" && p["p_destination_country"] !== "PE") ||
            (rate.from_currency === "BRL" && p["p_source_country"] !== "BR") ||
            (rate.to_currency === "BRL" && p["p_destination_country"] !== "BR")
          )
            throw new Error("El país no corresponde a la ruta seleccionada");
          if (
            (p["p_recipient_account_type"] === "cci" && rate.to_currency !== "PEN") ||
            (p["p_recipient_account_type"] === "pix" && rate.to_currency !== "BRL")
          )
            throw new Error("Tipo de cuenta incompatible con la moneda de destino");
          const country = rate.to_currency === "BRL" ? "BR" : "PE";
          if (
            (country === "BR" && p["p_billing_type"] !== "nfse") ||
            (country === "PE" && !["boleta", "factura"].includes(p["p_billing_type"]!))
          )
            throw new Error("El comprobante no corresponde al país de destino");
          const q = quoteAmounts(Number(p["p_amount"]), rate.rate, rate.commission_percent);
          const data = Object.fromEntries(
            Object.entries(p).map(([key, value]) => [key.replace(/^p_/, ""), value]),
          );
          const t = {
            ...data,
            amount: Number(p["p_amount"]),
            id: crypto.randomUUID(),
            user_id: uid(),
            demo_meta: {
              code: "BRS-NUEVA",
              advisor: "Equipo de operaciones",
              issuer: country === "BR" ? "Brasper · Brasil" : "Brasper · Perú",
            },
            billing_country: country,
            from_currency: rate.from_currency,
            to_currency: rate.to_currency,
            rate: rate.rate,
            commission: q.commission,
            recipient_amount: q.received,
            customer_email: p["p_billing_email"]!,
            customer_email_verified: false,
            status: "awaiting_payment",
            proof_path: null,
            payout_path: null,
            payout_reference: null,
            created_at: now(),
            updated_at: now(),
            invoices: [],
            deposit_instructions: [
              {
                bank: "Cuenta de ingreso",
                holder: "Brasper",
                account_number: "CUENTA-DE-PRUEBA",
                instructions: "Cuenta de prueba para presentación. No realizar depósitos.",
              },
            ],
          } as unknown as DemoTransfer;
          t.demo_meta!.code = `BRS-${t.id.slice(0, 8).toUpperCase()}`;
          state.transfers.unshift(t);
          event(state, t, "Solicitud registrada");
          write(state);
          return success(t.id);
        }
        const t = state.transfers.find((t) => t.id === p["p_transfer_id"]!);
        if (!t) throw new Error("Operación no encontrada");
        if (name === "submit_transfer_proof") {
          if (t.user_id !== uid() || !["awaiting_payment", "proof_submitted"].includes(t.status))
            throw new Error("Operación no autorizada");
          if (String(p["p_bank_reference"]! || "").trim().length < 2)
            throw new Error("Indica el número de operación bancaria");
          if (!(await fileStore("transfer-proofs", p["p_path"]!)))
            throw new Error("Archivo no encontrado");
          t.proof_path = p["p_path"]!;
          t.deposit_bank_reference = p["p_bank_reference"]!;
          t.status = "proof_submitted";
          event(state, t, "Prueba de pago recibida");
        } else {
          if (!staff) throw new Error("Solo el equipo demo puede revisar");
          if (String(p["p_note"]! || "").trim().length < 3)
            throw new Error("Completa la observación");
          if (name === "cancel_transfer") {
            if (
              t.status !== p["p_expected_status"]! ||
              !["awaiting_payment", "proof_submitted", "verified"].includes(t.status)
            )
              throw new Error("El estado cambió o no permite cancelar");
            t.status = "cancelled";
          } else if (name === "restore_verified_transfer") {
            if (t.status !== "cancelled") throw new Error("La operación no está cancelada");
            t.status = "verified";
          } else if (name === "review_transfer") {
            if (p["p_action"]! === "verify" && t.status === "proof_submitted") {
              t.status = "verified";
              t.verified_at = now();
            } else if (p["p_action"]! === "request_proof" && t.status === "proof_submitted")
              t.status = "awaiting_payment";
            else if (p["p_action"]! === "payout" && t.status === "verified") {
              if (!p["p_reference"]! || !(await fileStore("transfer-proofs", p["p_payout_path"]!)))
                throw new Error("Adjunta referencia y constancia del envío");
              t.status = "paid_out";
              t.payout_at = now();
              t.payout_reference = p["p_reference"]!;
              t.payout_path = p["p_payout_path"]!;
              event(state, t, "payout", p["p_note"]!);
              t.invoices = [
                {
                  issuer_country: t.billing_country || (t.billing_type === "nfse" ? "BR" : "PE"),
                  document_type:
                    t.billing_type === "nfse" ? "NFSE" : t.billing_type === "boleta" ? "03" : "01",
                  environment: "demo",
                  status: "queued",
                  number: null,
                  pdf_path: null,
                  xml_path: null,
                  cdr_path: null,
                  error: null,
                },
              ];
              const number = `VP-${String(state.nextInvoice ?? 2).padStart(6, "0")}`;
              state.nextInvoice = (state.nextInvoice ?? 2) + 1;
              write(state);
              const path = `demo/${t.id}/comprobante.pdf`;
              const issuedAt = now();
              await fileStore("invoice-documents", path, await demoPdf(t, number, issuedAt));
              const fresh = read();
              const latest = fresh.transfers.find((item) => item.id === t.id)!;
              latest.invoices = [
                {
                  issuer_country: t.billing_country || (t.billing_type === "nfse" ? "BR" : "PE"),
                  document_type:
                    t.billing_type === "nfse" ? "NFSE" : t.billing_type === "boleta" ? "03" : "01",
                  environment: "demo",
                  status: "demo_delivered",
                  number,
                  pdf_path: path,
                  xml_path: null,
                  cdr_path: null,
                  error: null,
                  demo_email: t.billing_email || t.customer_email,
                  demo_delivered_at: issuedAt,
                },
              ];
              latest.status = "completed";
              event(fresh, latest, "Comprobante preparado");
              event(
                fresh,
                latest,
                "Entrega preparada",
                `Destinatario: ${t.billing_email || t.customer_email}`,
              );
              latest.updated_at = now();
              write(fresh);
              return success();
            } else throw new Error("Cambio de estado no permitido");
          } else throw new Error("Acción no disponible en la demo");
          if (p["p_action"]! !== "payout") event(state, t, p["p_action"]! || name, p["p_note"]!);
        }
        t.updated_at = now();
        write(state);
        return success();
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error : new Error("No se pudo ejecutar la demo"),
        };
      }
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: File) => {
          try {
            validateProof(file);
            await fileStore(bucket, path, file);
            return success({ path });
          } catch (error) {
            return { data: null, error };
          }
        },
        createSignedUrl: async (path: string) => {
          try {
            let blob = await fileStore(bucket, path);
            if (!blob && bucket === "invoice-documents") {
              const transfer = read().transfers.find((t) =>
                t.invoices?.some((i) => i.pdf_path === path),
              );
              if (transfer && (staff || transfer.user_id === CLIENT))
                blob = await demoPdf(transfer);
              else throw new Error("Comprobante demo no encontrado");
            }
            blob ||= placeholder();
            const signedUrl = URL.createObjectURL(blob);
            urls.add(signedUrl);
            return success({ signedUrl });
          } catch (error) {
            return { data: null, error };
          }
        },
      }),
    },
    channel: () => {
      let fn: () => void = () => {};
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => void) => {
          fn = callback;
          return channel;
        },
        subscribe: () => {
          window.addEventListener("brasper-demo-change", fn);
          return channel;
        },
        cleanup: () => window.removeEventListener("brasper-demo-change", fn),
      };
      return channel;
    },
    removeChannel: async (channel: { cleanup: () => void }) => channel.cleanup(),
  };
  window.addEventListener("pagehide", () => urls.forEach((url) => URL.revokeObjectURL(url)), {
    once: true,
  });
  return client as unknown as SupabaseClient;
}
