import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
export type Draft = {
  id: string;
  route: string;
  amount: string;
  billingType: string;
  customer: string;
  email: string;
  purpose: string;
  recipient: string;
  accountType: string;
  proofCount: number;
  receivedAt: string;
  status: "pending_review";
};
export type Channel = {
  web?: { token: string; expires: number; operationId?: string; data?: Record<string, unknown> };
  cookie: string;
  mode: "assistant" | "human";
  lastInbound: number;
  flow?: { token: string; expires: number };
  draft?: Draft;
  history: { direction: "in" | "out"; text: string; at: string }[];
};
export type Inbound = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string };
    nfm_reply?: { response_json: string };
  };
  image?: { id: string };
  document?: { id: string; mime_type?: string };
};
export type Job = {
  id: string;
  message: Inbound;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
};
export type State = {
  channels: Record<string, Channel>;
  jobs: Job[];
  events: { at: string; kind: string; messageId?: string }[];
};
const dir = resolve(process.cwd(), "artifacts/whatsapp-beta");
const file = resolve(dir, "state.json");
let cache: State | undefined;
export function state() {
  if (cache) return cache;
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw Error("Unsafe storage");
  cache = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { channels: {}, jobs: [], events: [] };
  return cache!;
}
export function persist() {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink() || (existsSync(file) && lstatSync(file).isSymbolicLink()))
    throw Error("Unsafe storage");
  writeFileSync(file + ".tmp", JSON.stringify(state()), { mode: 0o600 });
  renameSync(file + ".tmp", file);
}
export function channel(phone: string) {
  const s = state();
  return (s.channels[phone] ||= { cookie: "", mode: "assistant", lastInbound: 0, history: [] });
}
export function record(kind: string, messageId?: string) {
  const s = state();
  s.events.push({ at: new Date().toISOString(), kind, ...(messageId ? { messageId } : {}) });
  s.events = s.events.slice(-300);
  persist();
}
export function saveText(phone: string, direction: "in" | "out", text: string) {
  const c = channel(phone);
  c.history.push({ direction, text: text.slice(0, 5000), at: new Date().toISOString() });
  c.history = c.history.slice(-50);
  persist();
}
