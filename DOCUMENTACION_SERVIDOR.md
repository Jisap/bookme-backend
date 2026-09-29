# Documentación Servidor Express — Bookme Backend

> Stack: **Node.js + Express 5 + Mongoose + JWT + Stripe + Google Calendar + Brevo (email OTP)**
> Punto de entrada: `server.js` · Módulos ESM (`"type": "module"`) · Arranque: `npm start` → `nodemon server.js`

---

## 1. Visión general

Backend de plataforma de reservas (**Bookme**):

- Los **negocios/proveedores** se registran (con verificación OTP por email), crean **servicios**, definen **disponibilidad semanal**, conectan **Google Calendar** y gestionan **reservas**, **wallet** y **retiros**.
- Los **clientes finales** reservan desde páginas públicas por `slug` del negocio (`/api/public/:slug/...`), verificando su email con OTP y pagando con **Stripe Checkout** (si el servicio tiene precio).
- Un **admin global** (login por variables de entorno) ve métricas y aprueba/rechaza retiros.

Base URL local: `http://localhost:5000`

```
GET /                  → "API WORKING" (healthcheck)
```

---

## 2. Estructura del proyecto

```
backend/
├── server.js                  # App Express, middlewares, montaje de rutas, listen HTTP
├── config/db.js               # Conexión Mongoose (MONGO_URL)
├── middleware/
│   ├── auth.js                # JWT usuario → req.user = { id }
│   └── adminAuth.js           # JWT admin (role=admin) → req.admin = { email }
├── models/
│   ├── User.js                # Negocio/proveedor
│   ├── Service.js             # Servicio ofrecido
│   ├── Availability.js        # Disponibilidad semanal (dayOfWeek 0-6 + slots)
│   ├── Booking.js             # Reserva
│   ├── EmailOtp.js            # OTPs (registro / reserva, TTL 10 min)
│   ├── WalletTransaction.js   # booking_payout | withdrawal_hold | withdrawal_reversal
│   └── Withdrawal.js          # Solicitudes de retiro
├── controllers/
│   ├── authController.js
│   ├── ServiceController.js
│   ├── availabilityController.js
│   ├── bookingController.js
│   ├── paymentController.js
│   ├── publicController.js
│   ├── integrationController.js
│   └── adminControllers.js
├── routes/
│   ├── authRoutes.js
│   ├── serviceRoutes.js
│   ├── availabilityRoutes.js
│   ├── bookingRoutes.js
│   ├── paymentRoute.js
│   ├── publicRoutes.js
│   ├── integrationRoutes.js
│   └── adminRoutes.js
└── utils/
    ├── emailOtp.js            # Crear/verificar OTP (bcrypt + TTL + intentos)
    ├── slotGenerator.js       # Genera slots libres según disponibilidad + reservas
    ├── time.js / overlap.js   # Validación y solapamiento de rangos HH:MM
    ├── money.js               # Comisión plataforma 10% (PLATFORM_FEE_RATE)
    ├── stripe.js              # getStripe() + toStripeAmount (precio*100)
    ├── wallet.js              # createBookingPayoutTransaction + getWalletSummary
    ├── googleCalendar.js      # OAuth2 + CRUD eventos
    ├── calendarLinks.js       # URL "Add to Google Calendar" para el cliente
    ├── bookingNotifications.js# Envío emails (Brevo) + OTP
    ├── slug.js                # slugify businessName/name
    └── bookingNotifications.js
```

---

## 3. Instalación y ejecución

```bash
cd backend
npm install
npm start   # nodemon server.js → http://localhost:5000
```

### 3.1 Variables de entorno (nombres — no incluir secretos en el repo)

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP (default `5000`) |
| `MONGO_URL` | Connection string MongoDB/Mongoose |
| `JWT_SECRET` | Firma JWT usuario y admin |
| `CLIENT_URL` | Base frontend para `success_url` / `cancel_url` de Stripe (default `http://localhost:5173`) |
| `CLIENT_REDIRECT_URI` | Destino redirect tras OAuth Google (`/profile?calendar=...`) |
| `STRIPE_SECRET_KEY` | Pagos Stripe Checkout |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth2 Google Calendar |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` / `EMAIL_FROM` | Envío OTP y notificaciones |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` o `ADMIN_PASSWORD_HASH` | Login admin |

> ⚠️ El `.env` actual contiene secretos reales. Rota Stripe/Brevo/Google/Mongo si ese archivo se subió a git.

---

## 4. `server.js` — bootstrap

1. `cors()` + `express.json()`.
2. `connectDB()` (Mongoose, `config/db.js`).
3. Montaje de rutas:

| Prefijo | Router |
|---|---|
| `/api/auth` | `authRoutes` |
| `/api/admin` | `adminRoutes` |
| `/api/services` | `serviceRoutes` |
| `/api/availability` | `availabilityRoutes` |
| `/api/integrations` | `integrationRoutes` |
| `/api/bookings` | `bookingRoutes` |
| `/api/payments` | `paymentRoutes` |
| `/api/public` + `/public` | `publicRoutes` (doble montaje, legacy) |

4. `http.createServer(app)` con handler `EADDRINUSE` → exit(1), luego `listen(PORT)`.

---

## 5. Autenticación

### 5.1 Usuario (`middleware/auth.js`)

- Header: `Authorization: Bearer <JWT>`
- JWT payload: `{ userId }`, expira `7d`.
- Errores: `401 No token provided` / `401 Invalid token`.
- Inyecta `req.user = { id }`.

### 5.2 Admin (`middleware/adminAuth.js`)

- Header `Authorization: Bearer <JWT>` (acepta `Bearer` sin espacio — bug menor, ver §11).
- JWT payload: `{ email, role: "admin" }`, expira `7d`.
- Errores: `401 ... required` / `403 Admin access required` / `401 Invalid admin token`.
- Inyecta `req.admin = { email }`.

---

## 6. Modelos (Mongoose)

### `User` — negocio/proveedor
`name*` · `email* unique lowercase` · `password* (bcrypt, min 6)` · `slug* unique lowercase` (generado de `businessName||name`, sufijo `-1,-2...`) · `businessName` · `businessDescription` · `brandTheme: emerald|indigo|rose|amber|slate (default emerald)` · `brandAccent (default #047857)` · `timezone (default UTC-5)` · `googleRefreshToken` · `googleCalendarConnected` · `googleCalendarId (default primary)` · `payoutDetails{ accountHolderName, bankName, accountLast4, ifsc(uppercase), upiId, isComplete, updatedAt }` · `timestamps`.

### `Service`
`userId* ref User` · `name*` · `duration* (min, ≥5)` · `price (default 0)` · `description` · `icon (default C1.png)` · `isActive (default false)` · `isDeleted (default false)` · `timestamps`.

### `Availability`
`userId*` · `dayOfWeek* 0-6 (0=Domingo)` · `slots[{ startTime: "HH:MM", endTime: "HH:MM" }]` · índice único `{userId, dayOfWeek}`.

### `Booking`
`userId* (negocio)` · `serviceId*` · `customerName*` · `customerEmail* lowercase` · `customerAvatar (default A1.png)` · `date* "YYYY-MM-DD"` · `startTime* / endTime* "HH:MM"` · `status: pending|pending_payment|confirmed|cancelled|payment_failed (default confirmed)` · `paymentStatus: not_required|pending|paid|failed` · `stripeSessionId (index)` · `amount, platformFeeAmount, providerPayoutAmount (minor units, ej. paise)` · `payoutStatus: not_required|pending|available|withdrawn` · `currency (default inr)` · `googleEventId` · `customerCalendarUrl` · `notes` · `reminderSent` · `isRescheduled` · `rescheduleCount` · `timestamps`.

### `EmailOtp`
`email* lowercase index` · `purpose: registration|booking` · `codeHash* (bcrypt, código 6 dígitos)` · `attempts (default 0, máx 5)` · `expireAt* (TTL 10 min, índice expire)` · `consumeAt` · `timestamps`.

### `WalletTransaction`
`userId*` · `bookingId?` · `withdrawalId?` · `type*: booking_payout|withdrawal_hold|withdrawal_reversal` · `amount*` · `currency (default inr)` · `status` · índice único parcial `{bookingId, type}`.

### `Withdrawal`
`userId*` · `amount* (≥1, minor units)` · `currency (default inr)` · `status: pending|processing|paid|rejected (default pending)` · `payoutSnapshot{ accountHolderName, bankName, accountLast4, ifsc, upiId }` · `adminNote` · `timestamps`.

---

## 7. API — referencia de endpoints

Convención errores: `400` validación · `401/403` auth · `404` no encontrado · `409` conflicto de horario · `402` pago no exitoso · `503` integración no configurada · `500` server (`{ message, error }`).

### 7.1 Auth — `/api/auth`

| Método | Ruta | Auth | Body / Query | Respuesta |
|---|---|---|---|---|
| POST | `/register` | No | `{ name, email, password, businessName?, businessDescription?, timezone?, emailOtp }` — requiere OTP `registration` válido (se consume) | `201 { message, token, user }` |
| POST | `/register/request-otp` | No | `{ email }` | `200 { message, result:{ sent, email, expiresInMinutes } }` |
| POST | `/register/verify-otp` | No | `{ email, emailOtp }` (verifica **y consume**) | `200 { message: "OTP verified" }` |
| POST | `/login` | No | `{ email, password }` | `200 { message, token, user }` |
| GET | `/me` | Sí | — | `200 { user }` |
| PUT | `/profile` | Sí | `{ businessName?, businessDescription?, timezone?, brandTheme?, brandAccent? }` — regenera `slug` único | `200 { message, user }` |

`user` = `{ id, name, email, slug, businessName, businessDescription, brandTheme, brandAccent, timezone, googleCalendarConnected, googleCalendarId, payoutDetails, stripeConfigured }`.

### 7.2 Servicios — `/api/services` (todo con auth usuario)

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/` | — | `200 { services }` (no eliminados, `createdAt DESC`) |
| POST | `/` | `{ name*, duration*, price?=0, description?="", icon?="C1.png" }` | `201 { message, service }` |
| PUT | `/:id` | `{ name?, duration?, price?, description?, isActive?, icon? }` (solo propios, no eliminados) | `200 { message, service }` |
| DELETE | `/:id` | — (soft-delete: `isDeleted=true, isActive=false`) | `200 { message, service }` |

### 7.3 Disponibilidad — `/api/availability` (auth usuario)

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/` | — | `200 { availability }` ordenado por `dayOfWeek` |
| POST/PUT* | `/` | `{ dayOfWeek 0-6*, slots: [{startTime, endTime}] }` — filtra slots inválidos (`isValidTimeRange`), upsert | `200 { message, availability }` |

> *Ver §11: el router registra dos veces `GET /` (la segunda debería ser POST/PUT). Hoy `saveAvailability` es inalcanzable por HTTP.

### 7.4 Reservas (privado, negocio) — `/api/bookings` (auth)

| Método | Ruta | Query/Body | Respuesta |
|---|---|---|---|
| GET | `/` | `?status=<status\|rescheduled>&date=YYYY-MM-DD` — por defecto excluye `pending_payment/payment_failed`; `status=rescheduled` filtra `isRescheduled=true` | `200 { bookings[] }` con `serviceId{name,duration,price}` + `customerCalendarUrl` calculado |
| PATCH | `/:id` | `{ status: pending\|pending_payment\|confirmed\|cancelled\|payment_failed }` — si `cancelled` borra evento Google; email async | `200 { message, booking, email }` |
| PATCH | `/:id/reschedule` | `{ date*, startTime*, endTime* }` — `409` si solapa; marca `isRescheduled`, `rescheduleCount++`; actualiza evento Google + email | `200 { message, booking, email }` |

### 7.5 Pagos / Wallet — `/api/payments` (auth)

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/` | — | `200 { payoutDetails, wallet:{ earned, withdrawOrPending, pendingWithdrawals, paidWithdrawals, availableBalance, available }, transactions[15], withdrawals[10] }` |
| PUT | `/payout-details` | `{ accountHolderName*, bankName?, accountNumber?, ifsc?, upiId? }` (requiere titular + cuenta o UPI; solo guarda `accountLast4`) | `200 { message, payoutDetails }` |
| POST | `/withdrawals` (alias legacy `/withdrawls`) | `{ amount }` minor units, mínimo `100`, `≤ available`, requiere `payoutDetails.isComplete` → crea `Withdrawal(pending)` + `WalletTransaction(withdrawal_hold, pending)` | `201 { message, withdrawal }` |

### 7.6 Integraciones Google — `/api/integrations`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/google/connect` | Sí | `200 { url }` OAuth2 (`offline`, `prompt=consent`, scope `calendar.events`, `state=userId`). `503` si faltan env Google |
| GET | `/google/callback` | No | Callback OAuth (`?code&state=userId`): guarda `googleRefreshToken`, `googleCalendarConnected=true`, redirect a `CLIENT_REDIRECT_URI/profile?calendar=connected\|failed\|missing_refresh_token` |

### 7.7 Pública (sin auth) — `/api/public` y `/public`

| Método | Ruta | Params/Body | Respuesta |
|---|---|---|---|
| GET | `/:slug` | slug negocio | `200 { business{id,name,slug,businessName,businessDescription,brandTheme,brandAccent,timezone,googleCalendarConnected}, services[] }` (activos, no eliminados) |
| GET | `/:slug/slots` | `?date=YYYY-MM-DD*&serviceId*` | `200 { slots: [{startTime,endTime}] }` generados por `generateSlots` |
| POST | `/:slug/request-otp` | `{ customerEmail* }` | `200 { message }` envía OTP `booking` |
| POST | `/:slug/verify-otp` | `{ customerEmail*, emailOtp* }` (no consume) | `200 { message }` |
| POST | `/:slug/book` | `{ serviceId*, customerName*, customerEmail*, customerAvatar?, date*, startTime*, endTime*, notes?, emailOtp* }` — valida negocio/servicio, conflicto horario, consume OTP; gratis → `confirmed` + evento Calendar + email; pago → Stripe Checkout | Gratis `201 { message, booking, customerCalendarUrl, email }` · Pago `201 { message:"Continue to payment", bookingId, checkoutUrl }` |
| GET | `/booking/status` | `?session_id=...` o `?booking_id=...` — si `pending_payment` + `session_id`, verifica Stripe; `paid` → confirma (chequeo conflicto, evento Calendar, `booking_payout` wallet, email); si no pagado → `payment_failed` + `402` | `200 { booking }` |
| POST | `/booking/cancel-payment` | `{ booking_id* }` — solo `pending_payment` → `payment_failed/failed` | `200 { message }` |

⚠️ Orden de rutas: `/booking/status` y `/booking/cancel-payment` deben ir **antes** de `/:slug` (ya lo están). `GET /:slug` capturaría `/booking/...` si se reordena.

### 7.8 Admin — `/api/admin`

| Método | Ruta | Auth | Body | Respuesta |
|---|---|---|---|---|
| POST | `/login` | No | `{ email*, password* }` vs `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt) o `ADMIN_PASSWORD` | `200 { message, token(role=admin), admin:{email} }` · `503` si no configurado |
| GET | `/dashboard` | Admin | — | `200 { summary, users[100], withdrawals[50], recentBookings[10] }` — `summary = { users, bookings, paidBookings, grossRevenue, platformFees, providerPayouts, walletEarned, usersAvailableBalance, pendingWithdrawals, paidWithdrawals, withdrawalHolds }` |
| PATCH | `/withdrawals/:id` | Admin | `{ status: pending\|processing\|paid\|rejected, adminNote? }` — terminales (`paid/rejected`) inmutables; `rejected` crea `withdrawal_reversal` | `200 { message, withdrawal, summary }` |

---

## 8. Flujos clave

### 8.1 Registro con OTP
`POST /api/auth/register/request-otp` → email 6 dígitos (hash bcrypt, TTL 10 min, máx 5 intentos) → `POST /register/verify-otp` (consume) o directo `POST /register` con `emailOtp` → crea usuario + `slug` único + JWT 7d.

### 8.2 Reserva pública
1. `GET /api/public/:slug` (negocio + servicios) → `GET /:slug/slots?date&serviceId`.
2. `POST /:slug/request-otp` → `POST /:slug/verify-otp` (opcional) → `POST /:slug/book` con `emailOtp` (se consume).
3. Ventana de bloqueo: `pending_payment` < 30 min también bloquea slots (`holdWindowStart`, `slotGenerator`, `findActiveSlotBookings`).
4. Gratis (`price=0`): `confirmed` inmediato + Google Calendar + email.
5. Pago: `pending_payment` + Stripe Checkout (`currency=inr`, `metadata.bookingId`, `success_url={CLIENT_URL}/booking/success?session_id&slug`, `cancel_url=.../booking/cancelled?booking_id&slug`) → frontend llama `GET /booking/status?session_id=` → confirma o marca `payment_failed`. Cancelación manual: `POST /booking/cancel-payment`.

### 8.3 Dinero / Wallet
- `toStripeAmount(price) = round(price*100)`; `calculatePlatformSplit`: fee 10% → `platformFeeAmount`, resto `providerPayoutAmount`.
- Al confirmarse pago: `WalletTransaction(booking_payout, available)` idempotente por índice `{bookingId,type}`.
- Resumen: `earned - held + reversed = available`.
- Retiro: valida `payoutDetails.isComplete`, mínimo 100 minor units, saldo suficiente → `Withdrawal(pending)` + `withdrawal_hold`. Admin: `processing/paid` o `rejected` (+`withdrawal_reversal`).

### 8.4 Google Calendar
`GET /google/connect` (auth) → consentimiento → `GET /google/callback?code&state` → guarda `refresh_token`. Cada reserva crea/actualiza/cancela evento (`primary` por defecto, timezone negocio, recordatorios email 24h + popup 30m, `attendees=[customerEmail]`). Si no conectado, solo devuelve `customerCalendarUrl` (link "add to calendar").

---

## 9. Utils — referencia rápida

| Módulo | Export | Descripción |
|---|---|---|
| `emailOtp.js` | `requestEmailOtp({email,purpose})`, `verifyEmailOtp({email,purpose,code,consume})` | OTP 6 dígitos (`crypto.randomInt`), hash bcrypt, invalida anteriores, TTL 10 min, 5 intentos, envía vía `sendOtpNotification` (Brevo) |
| `slotGenerator.js` | `generateSlots({userId,service,date})` | Lee `Availability(dayOfWeek)`, trocea ventanas en bloques de `service.duration`, excluye solapes con `confirmed` + `pending_payment` recientes |
| `time.js` / `overlap.js` | `isValidTimeRange`, `timeToMinutes/minutesToTime/getDayOfWeek`, `timesOverlap/timeOverlap` | Validación `HH:MM` y detección solape |
| `money.js` | `PLATFORM_FEE_RATE=0.1`, `calculatePlatformSplit`, `formatMinorMoney` | Comisión y formato |
| `stripe.js` | `getStripe()`, `toStripeAmount(price)` | `null` si falta `STRIPE_SECRET_KEY`; conversión a minor units |
| `wallet.js` | `createBookingPayoutTransaction`, `getWalletSummary(userId)` | Payout idempotente + agregaciones wallet/retiros |
| `googleCalendar.js` | `getGoogleAuthUrl`, `getGoogleTokens`, `create/update/cancelBookingCalendarEvent` | OAuth2 + Calendar v3 |
| `calendarLinks.js` | `buildCustomerCalendarUrl` | Link Google Calendar para el cliente |
| `bookingNotifications.js` | `sendBookingNotification`, `sendOtpNotification` | Emails Brevo (confirmación/cancelación/reprogramación/OTP) |
| `slug.js` | `slugify` | Normaliza `businessName/name` a slug |

---

## 10. Códigos de error comunes

| Caso | Código | Mensaje típico |
|---|---|---|
| Sin token / token inválido | `401` | `No token provided` / `Invalid token` |
| Sin rol admin | `403` | `Admin access required` |
| Email duplicado / OTP inválido | `400` | `Email already in use` / `Invalid OTP` / `Email verification is required` |
| Recurso ajeno/inexistente | `404` | `Service not found` / `Booking not found` / `Business not found` |
| Slot ocupado | `409` | `That slot is already booked` / `...no longer available` |
| Pago no completado | `402` | `Payment was not successful...` |
| Stripe/Google no configurado | `503` | `Stripe payments are not configured yet` / `Server calendar integration not configured` |
| Retiro inválido | `400` | `Withdrawal amount must be at least 100 paise` / `...exceeds available balance` / `Add payout details...` |
| Retiro terminal | `400` | `Withdrawal is already paid/rejected and cannot be changed` |

---

## 11. Observaciones / bugs detectados (revisar)

1. **`availabilityRoutes.js:8-9`** — dos `router.get("/")`; el segundo (`saveAvailability`) nunca es alcanzable y además debería ser `POST` o `PUT`. Guardar disponibilidad por HTTP hoy es imposible.
2. **`adminAuth.js:5`** — `startsWith("Bearer")` sin espacio; acepta `Bearervalido`. Alinear con `auth.js` (`"Bearer "`).
3. **`money.js:7`** — `Number.isInfinite(amount) ? ... : 0` está invertido (montos finitos → `0`). Debería ser `Number.isFinite`. Impacta `platformFeeAmount/providerPayoutAmount` (hoy siempre 0 salvo `Infinity`).
4. **`publicController` gratis vs pago** — `amount===0` confirma directo; si `price` es `null/undefined` también cae a gratis. Validar intencionalidad.
5. **Moneda hardcodeada `inr`** en `Booking`, `Withdrawal`, `WalletTransaction` y Checkout, aunque el negocio usa `timezone UTC-5`. Confirmar moneda objetivo.
6. **`Service.isActive` default `false`** — los servicios recién creados no aparecen en la pública hasta activarlos (`PUT /api/services/:id {isActive:true}`). Documentar en frontend.
7. **Doble montaje `publicRoutes`** en `/api/public` y `/public` — mantener solo uno para evitar confusión.
8. **`.env` con secretos** commiteado — rotar credenciales y añadir `.env` a `.gitignore` (verificar que lo esté).
9. **`handleGoogleCallback`** — typo redirect `missing_refresh_token}` (llave extra) y mezcla `GOOGLE_REDIRECT_URI` vs `CLIENT_REDIRECT_URI` en el caso `!code||!state`.
10. **`toStripeAmount`** — multiplica por 100 asumiendo precio en unidades; `amount` en BD queda en minor units. Frontend debe enviar `price` en unidades (no paise).

---

## 12. Ejemplos cURL

```bash
BASE=http://localhost:5000

# Registro
curl -X POST $BASE/api/auth/register/request-otp -H "Content-Type: application/json" -d '{"email":"negocio@mail.com"}'
curl -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d '{"name":"Ana","email":"negocio@mail.com","password":"123456","businessName":"Salon Ana","emailOtp":"123456"}'

# Login + perfil
curl -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"negocio@mail.com","password":"123456"}'
curl $BASE/api/auth/me -H "Authorization: Bearer <JWT>"

# Servicio + disponibilidad (cuando se corrija §11.1)
curl -X POST $BASE/api/services -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"name":"Corte","duration":30,"price":50,"isActive":true}'

# Pública
curl "$BASE/api/public/salon-ana"
curl "$BASE/api/public/salon-ana/slots?date=2026-10-01&serviceId=<ID>"

# Reserva pública (pago)
curl -X POST $BASE/api/public/salon-ana/book -H "Content-Type: application/json" -d '{"serviceId":"<ID>","customerName":"Luis","customerEmail":"luis@mail.com","date":"2026-10-01","startTime":"10:00","endTime":"10:30","emailOtp":"654321"}'
# → { checkoutUrl } → tras pagar:
curl "$BASE/api/public/booking/status?session_id=<STRIPE_SESSION>"

# Admin
curl -X POST $BASE/api/admin/login -H "Content-Type: application/json" -d '{"email":"admin@bookme.com","password":"123456789"}'
curl $BASE/api/admin/dashboard -H "Authorization: Bearer <ADMIN_JWT>"
```

---

*Generado por inspección de `server.js`, `routes/`, `controllers/`, `models/`, `middleware/`, `config/` y `utils/` al 2026-09-29.*
