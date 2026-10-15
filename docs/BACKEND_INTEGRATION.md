# Web ↔ BRASPER Cloud Functions

The public site (landing + `/transferencias`) runs on the BRASPER Cloud Functions documented in
[iathon-fintech/functions/docs](https://github.com/binnicordova/iathon-fintech/tree/main/functions/docs).
The browser talks to Firebase over plain REST, so the site ships **no Firebase SDK**.

## Flow

```
landing calculator      getRates (estimate only, never binding)
/transferencias
  1 Cotizar             createQuote   → rate frozen for 15 min (server numbers are the only binding ones)
  2 Datos               createOrder   → BR-0001, paymentAccount, status pending
  3 Pagar               Storage upload proofs/<uid>/<orderId>/… → submitProof → validating
  Seguimiento           Firestore orders/<id> polled every 15 s → timeline, cancelOrder, getReceipt
```

Talking to a person is WhatsApp (`wa.me/51966991933`), as the backend docs describe; the handoff-queue
functions are not used.

## Code map

| Path                        | Role                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/api/config.ts`     | Public Firebase config + endpoint builders (`VITE_FIREBASE_*` overrides, emulator support)  |
| `src/lib/api/session.ts`    | Silent anonymous sign-in, token refresh, session kept in `localStorage`                     |
| `src/lib/api/client.ts`     | `callFunction` (`{data}` protocol, one retry on 401) and the typed `api` object             |
| `src/lib/api/proof.ts`      | Proof validation (image/PDF < 8 MB) and Storage upload                                      |
| `src/lib/api/firestore.ts`  | Read-only access to the client's own `orders` (REST)                                        |
| `src/lib/pricing.ts`        | Browser-safe **estimate** of the server's quote formula (verified equal to the live server) |
| `src/lib/validators.ts`     | Same document/email/name rules as `createOrder`                                             |
| `src/lib/local-data.ts`     | What the browser remembers (see below)                                                      |
| `src/components/transfer/*` | Quote, details, payment, order timeline, order list                                         |

## What is stored in the browser

- **Session** (`brasper.session.v1`): the anonymous Firebase identity. It is the only key to the
  client's orders. Clearing site data or switching device loses access (the team can help via WhatsApp).
- **Order summaries** (`brasper.orders.v1`): id, status, amounts. No document, email or account numbers.
- **Quote in progress** (`brasper.quote.v1`): kept only while its rate is guaranteed.
- **Profile** (`brasper.profile.v1`): only if the client ticks "Recordar mis datos"; removed by unticking.

If storage is blocked (private window) everything falls back to memory for the current tab.

## Running against the emulators

```sh
# in iathon-fintech
bun run emulators
# here
VITE_FIREBASE_EMULATOR_HOST=localhost npm run dev
```

Note the Firestore emulator defaults to port 8080, the same as this dev server; move one of them.

## Intentionally out of scope

Staff tools (`reviewOrder`, `exportOrders`, `runFact`, `createManualOrder`) and the Gemma assistant
(`assistantGenerate`) have no UI here. Receipts are in the backend's **test mode** and say so.
