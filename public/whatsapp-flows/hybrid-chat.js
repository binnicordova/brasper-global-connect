(() => {
  const $ = (id) => document.getElementById(id);
  const messages = [];
  let busy = false,
    paused = false;
  const context = () => ({ step: currentStep, mode, created });
  function add(role, text, source) {
    messages.push({ role, text });
    const item = document.createElement("div");
    item.className = "chat-message " + role;
    const label = document.createElement("small");
    label.textContent =
      role === "user" ? "TÚ" : source === "ai" ? "BRASPER · IA" : "BRASPER · GUÍA";
    const content = document.createElement("span");
    content.textContent = text;
    item.append(label, content);
    $("chat-messages").append(item);
    $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
  }
  function setMode(next) {
    paused = next === "human";
    $("handoff").hidden = !paused;
    $("human").hidden = paused;
    $("chat-input").disabled = paused || busy;
    $("chat-send").disabled = paused || busy;
    $("chat-connection").textContent = paused
      ? "Atención humana · IA pausada"
      : "Asistente virtual · chat híbrido";
  }
  async function request(payload, text) {
    if (busy) return;
    busy = true;
    $("chat-send").disabled = true;
    $("chat-status").textContent = "Preparando respuesta…";
    if (text) add("user", text);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, context: context() }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) {
        $("chat-status").textContent = result.error || "No se pudo responder. Puedes reintentar.";
        return;
      }
      if (payload.action === "reset") {
        messages.length = 0;
        $("chat-messages").replaceChildren();
      }
      add("assistant", result.answer, result.source);
      setMode(result.mode);
      $("chat-status").textContent =
        result.source === "ai"
          ? "Respuesta con OpenAI · verifica los datos en el formulario."
          : "Respuesta del flujo Brasper.";
      if (result.action === "start") {
        selectMode("web");
        $("web-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      $("chat-status").textContent = "No se pudo conectar. El formulario sigue disponible.";
    } finally {
      busy = false;
      setMode(paused ? "human" : "assistant");
    }
  }
  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (paused || busy) return;
    const text = $("chat-input").value.trim();
    if (!text) return;
    $("chat-input").value = "";
    request({ message: text }, text);
  });
  $("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("chat-form").requestSubmit();
    }
  });
  document
    .querySelectorAll("[data-help]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        request({ action: "faq", topic: button.dataset.help }, button.textContent.trim()),
      ),
    );
  $("human").addEventListener("click", () =>
    request({ action: "human" }, "Prefiero hablar con una persona"),
  );
  $("resume-chat").addEventListener("click", () => request({ action: "resume" }));
  $("reset-chat").addEventListener("click", () => request({ action: "reset" }));
  $("start-change").addEventListener("click", () => {
    selectMode("web");
    request({ action: "start" }, "Quiero empezar mi cambio");
  });
  $("copy-summary").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(
        "BRASPER / Paso " +
          (currentStep + 1) +
          " / Solicitud registrada en este recorrido: " +
          (created ? "sí" : "no") +
          "\n\n" +
          messages
            .map((m) => (m.role === "user" ? "Cliente" : "Asistente") + ": " + m.text)
            .join("\n\n"),
      );
      $("chat-status").textContent = "Resumen copiado. No se envió a ningún asesor.";
    } catch {
      $("chat-status").textContent = "No se pudo copiar. Puedes seleccionar los mensajes.";
    }
  });
  add(
    "assistant",
    "Hola, soy el asistente virtual de Brasper. Puedo resolver tus preguntas y acompañarte. Para cambiar soles o reales, completaremos los datos en el formulario. ¿Qué necesitas hoy?",
    "flow",
  );
  fetch("/api/assistant")
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((data) => {
      if (Array.isArray(data.messages) && data.messages.length) {
        messages.length = 0;
        $("chat-messages").replaceChildren();
        data.messages.forEach((m) => add(m.role, m.content, "history"));
      }
      setMode(data.mode);
      if (!data.configured) {
        const link = document.createElement("a");
        link.href = "./local-key.html";
        link.textContent = "Conectar clave local de OpenAI";
        $("chat-status").replaceChildren(link);
      }
    })
    .catch(() => {
      $("chat-connection").textContent = "Servidor de chat no disponible";
    });
})();
