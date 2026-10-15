/** Official BRASPER WhatsApp: "Talk to a person" opens it with the message prepared. */
export const BRASPER_WHATSAPP = "51966991933";

export const whatsappLink = (message?: string) =>
  `https://wa.me/${BRASPER_WHATSAPP}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
