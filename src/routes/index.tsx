import { exchangePath } from "@/lib/exchange-intent";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeftRight,
  ArrowDownUp,
  ShieldCheck,
  LockKeyhole,
  MessageCircle,
  Globe2,
  Check,
  ChevronDown,
  Menu,
  X,
  TrendingUp,
  Send,
  Copy,
  Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { currencies, convertCurrency, type Currency } from "@/lib/currency";
import heroImage from "@/assets/brasper-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Brasper | Envía dinero entre Perú, Brasil y EE. UU." },
      {
        name: "description",
        content:
          "Cotiza tu transferencia internacional, adjunta tu prueba de pago y sigue el envío con atención en español y portugués.",
      },
      { property: "og:title", content: "Brasper | Tu dinero, sin fronteras" },
      {
        property: "og:description",
        content: "Conectamos Perú, Brasil y Estados Unidos. Cotiza tu transferencia con Brasper.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Brand() {
  return (
    <a href="#" className="brand" aria-label="Brasper, inicio">
      <span className="brand-mark" aria-hidden="true" />
      brasper<span className="text-primary">.</span>
    </a>
  );
}
const features = [
  {
    icon: Send,
    title: "Sigue tu envío",
    text: "Consulta tu solicitud, la revisión del pago y la constancia de envío desde tu cuenta.",
  },
  {
    icon: ShieldCheck,
    title: "Tu tranquilidad, primero",
    text: "Transacciones seguras y acompañamiento en cada paso de tu transferencia.",
  },
  {
    icon: Headphones,
    title: "Hablamos tu idioma",
    text: "Un equipo cercano que te atiende en español y portugués. Sin complicaciones.",
  },
  {
    icon: TrendingUp,
    title: "Cotiza antes de pagar",
    text: "Revisa la tasa, la comisión y el monto que recibirá tu destinatario antes de continuar.",
  },
];
const money = (value: number) =>
  value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Index() {
  const [from, setFrom] = useState<Currency>("PEN");
  const [to, setTo] = useState<Currency>("BRL");
  const [amount, setAmount] = useState("1000");
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const received = convertCurrency(Number(amount), from, to);
  const openContact = (
    message = "Hola, Brasper. Me gustaría recibir información sobre sus transferencias internacionales.",
  ) => {
    setDraft(message);
    setCopied(false);
    setDialog(true);
  };
  const quote = () =>
    openContact(
      `Hola, Brasper. Quiero cotizar un envío de ${money(Number(amount) || 0)} ${from} a ${to}. El calculador muestra aproximadamente ${money(received)} ${to}. ¿Cuál es la tasa vigente?`,
    );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    openContact(
      `Hola, Brasper. Soy ${data.get("name")}.\nMi correo: ${data.get("email")}\n${data.get("message")}`,
    );
  };
  const closeMenu = () => setMenu(false);
  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <Brand />
          <nav aria-label="Navegación principal" className={`nav-links ${menu ? "open" : ""}`}>
            <a href="#como-funciona" onClick={closeMenu}>
              Cómo funciona
            </a>
            <a href="#beneficios" onClick={closeMenu}>
              Por qué Brasper
            </a>
            <a href="#seguimiento" onClick={closeMenu}>
              Seguimiento
            </a>
            <Link to="/transferencias" onClick={closeMenu}>
              Mis transferencias
            </Link>
            <a href="#contacto" onClick={closeMenu}>
              Contacto
            </a>
          </nav>
          <div className="header-actions">
            <span className="language">
              <Globe2 size={14} /> ES
            </span>
            <Button variant="brand" className="header-cta" onClick={() => openContact()}>
              Hablemos <ArrowUpRight />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="menu-toggle"
              aria-label={menu ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <img
            className="hero-photo"
            src={heroImage}
            width={1536}
            height={1024}
            alt="Una mujer sonríe mientras usa su teléfono para conectar con quienes más quiere"
            fetchPriority="high"
          />
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="dot" /> Tu dinero más cerca. Sin fronteras.
              </div>
              <h1 id="hero-title">
                Envía dinero.
                <br />
                Acerca distancias.
                <br />
                <span>Con claridad.</span>
              </h1>
              <p>
                Conectamos Perú, Brasil y Estados Unidos.
                <br />
                Completa la cuenta del destinatario, adjunta tu comprobante y sigue cada paso de tu
                envío.
              </p>
              <Button variant="brand" size="lg" className="hero-cta" asChild>
                <Link to="/transferencias">
                  Iniciar mi transferencia <ArrowRight />
                </Link>
              </Button>
              <button className="hero-help" onClick={() => openContact()}>
                <MessageCircle size={16} /> Prefiero hablar con el equipo
              </button>
              <div className="hero-trust">
                <div className="flag-stack">
                  <span className="country-flag flag-pe" aria-label="Perú" />
                  <span className="country-flag flag-br" aria-label="Brasil" />
                  <span className="country-flag flag-us" aria-label="Estados Unidos" />
                </div>
                <span>Atención en español y portugués.</span>
              </div>
            </div>
            <div className="calculator" id="cotizar">
              <h2>Tu envío empieza aquí</h2>
              <p>Calcula cuánto recibirán al otro lado.</p>
              <div className="money-field">
                <label htmlFor="amount">Tú envías</label>
                <div className="money-row">
                  <input
                    id="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Monto a enviar"
                  />
                  <select
                    aria-label="Moneda de origen"
                    value={from}
                    onChange={(e) => setFrom(e.target.value as Currency)}
                  >
                    {Object.keys(currencies).map((code) => (
                      <option value={code} key={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="swap-row">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Intercambiar monedas"
                  title="Intercambiar monedas"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                >
                  <ArrowDownUp />
                </Button>
              </div>
              <div className="money-field">
                <label htmlFor="received">Reciben aproximadamente</label>
                <div className="money-row">
                  <output id="received" aria-live="polite">
                    {money(received)}
                  </output>
                  <select
                    aria-label="Moneda de destino"
                    value={to}
                    onChange={(e) => setTo(e.target.value as Currency)}
                  >
                    {Object.keys(currencies).map((code) => (
                      <option value={code} key={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rate-details">
                <div>
                  <span>Tasa de referencia</span>
                  <strong className="rate-value">
                    1 {from} = {convertCurrency(1, from, to).toFixed(4)} {to}
                  </strong>
                </div>
                <div>
                  <span>Comisión de envío</span>
                  <strong>A confirmar al cotizar</strong>
                </div>
                <div>
                  <span>Atención personalizada</span>
                  <strong className="flex items-center gap-1">
                    <Check size={12} /> Español y portugués
                  </strong>
                </div>
              </div>
              <Button variant="brand" className="send-button" asChild>
                <a href={exchangePath(from, to, amount)}>
                  <ArrowLeftRight /> Hacer mi cambio desde la web <ArrowRight />
                </a>
              </Button>
              <button type="button" onClick={quote} className="portal-start-link">
                Prefiero atención por WhatsApp <MessageCircle size={14} />
              </button>
              <p className="estimate-note">
                Cálculo ilustrativo, no es una cotización. La tasa y el tiempo de entrega se
                confirman antes de enviar.
              </p>
              <div className="safe-note">
                <LockKeyhole size={12} /> Tu seguridad está en cada paso.
              </div>
            </div>
          </div>
        </section>
        <div className="corridor">
          <div className="wrap corridor-inner">
            <span className="corridor-intro">CONECTAMOS LO QUE IMPORTA</span>
            <span>
              <i className="country-flag flag-pe" /> Perú
            </span>
            <ArrowLeftRight />
            <span>
              <i className="country-flag flag-br" /> Brasil
            </span>
            <ArrowLeftRight />
            <span>
              <i className="country-flag flag-us" /> Estados Unidos
            </span>
          </div>
        </div>
        <section className="features wrap" id="beneficios">
          <div className="section-heading">
            <span className="section-kicker">Más cerca, más simple</span>
            <h2>Tu confianza nos mueve.</h2>
            <p>No solo transferimos dinero. Conectamos personas, planes y oportunidades.</p>
          </div>
          <div className="feature-grid">
            {features.map((f) => (
              <article className="feature" key={f.title}>
                <div className="feature-icon">
                  <f.icon strokeWidth={1.7} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="tracking-section" id="seguimiento">
          <div className="wrap tracking-inner">
            <div>
              <span className="section-kicker">Cada paso, a tu alcance</span>
              <h2>Tu envío tiene una historia. Puedes seguirla.</h2>
              <p>
                Tu cuenta reúne la cotización, la prueba de pago, el estado del envío y tu
                comprobante cuando esté disponible.
              </p>
              <Button variant="brand" asChild>
                <Link to="/transferencias">
                  Ver mis transferencias <ArrowRight />
                </Link>
              </Button>
            </div>
            <ol className="tracking-steps" aria-label="Etapas de una transferencia">
              <li>
                <span>01</span>
                <div>
                  <strong>Solicitud registrada</strong>
                  <p>Revisa los datos y las instrucciones de pago.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Pago en revisión</strong>
                  <p>El equipo comprueba el ingreso real en banco.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Dinero enviado</strong>
                  <p>Consulta el estado y la constancia del envío.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>Comprobante disponible</strong>
                  <p>Recíbelo por correo y descárgalo desde tu cuenta.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>
        <section className="wrap how-section" id="como-funciona">
          <div className="section-heading">
            <span className="section-kicker">Sin vueltas, sin distancias</span>
            <h2>De aquí para allá. Así de fácil.</h2>
          </div>
          <div className="how-grid">
            {[
              [
                "01",
                "Cotiza y registra",
                "Entra a tu cuenta, elige una cotización vigente y registra los datos de tu destinatario.",
              ],
              [
                "02",
                "Paga y adjunta tu prueba",
                "Deposita a la cuenta indicada y sube tu constancia. El equipo verificará el ingreso.",
              ],
              [
                "03",
                "Sigue tu envío",
                "Consulta el avance desde tu cuenta y recibe el comprobante después del envío y la emisión.",
              ],
            ].map(([n, title, text]) => (
              <article key={n}>
                <div className="step-number">
                  {n}
                  <ArrowUpRight />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="wrap landing-faq" id="preguntas">
          <div className="section-heading">
            <span className="section-kicker">Antes de empezar</span>
            <h2>Lo que necesitas saber.</h2>
          </div>
          {[
            [
              "¿La calculadora muestra la tasa de mi operación?",
              "La calculadora de esta página es ilustrativa. En tu cuenta verás las cotizaciones habilitadas con su tasa, comisión y vencimiento antes de registrar la operación.",
            ],
            [
              "¿Subir mi prueba confirma que ya pagué?",
              "La prueba se envía a revisión. El equipo confirma el ingreso consultando el banco; solo entonces continúa con el envío.",
            ],
            [
              "¿Qué archivo puedo adjuntar?",
              "Una imagen JPG o PNG, o un PDF de hasta 5 MB. Tus archivos se guardan de forma privada y se consultan desde tu operación.",
            ],
            [
              "¿Cuándo recibo mi comprobante?",
              "Después de registrar el envío y completar la emisión fiscal. Podrás descargarlo desde tu cuenta y recibirlo por correo cuando el servicio esté habilitado.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
        <section className="contact-section" id="contacto">
          <div className="wrap contact-inner">
            <div className="contact-copy">
              <span className="section-kicker">Personas, no respuestas automáticas</span>
              <h2>
                Una conversación.
                <br />
                Un mundo de posibilidades.
              </h2>
              <p>
                ¿Tu primer envío? ¿Una pregunta sobre la tasa? Cuéntanos qué necesitas. Estamos para
                acompañarte.
              </p>
              <div className="contact-languages">
                <MessageCircle size={17} /> Hablamos español y portugués <Globe2 size={15} />
              </div>
            </div>
            <form className="contact-form" onSubmit={submit}>
              <label>
                Tu nombre
                <input
                  name="name"
                  placeholder="¿Cómo te llamas?"
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Tu correo
                <input
                  name="email"
                  type="email"
                  placeholder="hola@ejemplo.com"
                  autoComplete="email"
                  maxLength={200}
                  required
                />
              </label>
              <label className="wide">
                ¿Cómo podemos ayudarte?
                <textarea
                  name="message"
                  placeholder="Cuéntanos sobre tu próximo envío…"
                  maxLength={2000}
                  required
                />
              </label>
              <Button variant="brand" type="submit" className="wide">
                Hablemos por WhatsApp <ArrowUpRight />
              </Button>
              <p className="form-note wide">
                Tu mensaje se preparará para WhatsApp. No se envía ni se guarda automáticamente.
              </p>
            </form>
          </div>
        </section>
      </main>
      <footer className="wrap">
        <div className="footer-main">
          <div>
            <Brand />
            <p>Tu dinero más cerca. Sin fronteras.</p>
          </div>
          <div className="footer-links">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#beneficios">Por qué Brasper</a>
            <a href="#contacto">Contacto</a>
            <Button
              variant="link"
              className="h-auto p-0 text-[10px] text-muted-foreground"
              onClick={() => setPrivacy(true)}
            >
              Privacidad
            </Button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Brasper. Todos los derechos reservados.</span>
          <span>Hecho para conectar Perú, Brasil y Estados Unidos.</span>
        </div>
      </footer>
      <Button
        variant="brand"
        className="floating-chat"
        aria-label="Contactar por WhatsApp"
        title="Contactar por WhatsApp"
        onClick={() => openContact()}
      >
        <MessageCircle />
      </Button>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogTitle>Tu mensaje para Brasper</DialogTitle>
          <DialogDescription>
            Revisa tu mensaje antes de abrir el WhatsApp oficial de Brasper. Todavía no se ha
            enviado.
          </DialogDescription>
          <div className="dialog-message">{draft}</div>
          <a
            className="portal-whatsapp"
            href={`https://wa.me/51966991933?text=${encodeURIComponent(draft)}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp <ArrowUpRight size={16} />
          </a>
          <Button
            variant="brand"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(draft);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Mensaje copiado" : "Copiar mensaje"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={privacy} onOpenChange={setPrivacy}>
        <DialogContent>
          <DialogTitle>Privacidad de tus datos</DialogTitle>
          <DialogDescription>
            Este formulario prepara tu mensaje únicamente en esta página. No almacenamos ni enviamos
            tu nombre, correo o mensaje. Al cerrar o recargar la página se descartan. La política
            oficial de Brasper estará disponible próximamente.
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
}
