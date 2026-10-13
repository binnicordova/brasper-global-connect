/** Recognize the signed cloud link, distinct from legacy local preview links. */
export function hostedWhatsappToken(search: string) {
  const token = new URLSearchParams(search).get("wa") || "";
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.\d{10}\.[a-f0-9]{64}$/.test(
    token,
  )
    ? token
    : null;
}

export function whatsappReturnPath(search: string) {
  const token = hostedWhatsappToken(search);
  return "/transferencias" + (token ? "?wa=" + encodeURIComponent(token) : "");
}
