<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Screen Capture — guía para agentes de código

## Resumen del proyecto

Aplicación web que graba la pantalla desde el navegador (`getDisplayMedia` +
`MediaRecorder`), sube el vídeo `webm` **directo del cliente** a un storage
S3-compatible, y guarda solo los metadatos (`description`, `s3Key`, `s3Url`,
`createdAt`) en MongoDB. El backend nunca ve el binario del vídeo. El plan de
implementación fase a fase — incluida la arquitectura completa y las
decisiones ya tomadas — vive en `PROMT.md`; no lo dupliques aquí, consúltalo
para contexto histórico de por qué las cosas están como están.

## Stack técnico

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript estricto
- Tailwind CSS 4 (config vía `@theme` en `app/globals.css`, sin `tailwind.config.js`)
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — storage S3-compatible
- `mongodb` (driver nativo, sin ORM) — metadatos
- `zod` — validación de payloads y de variables de entorno
- Playwright — E2E

## Comandos

```bash
docker compose up -d          # Mongo + RustFS locales (ver docker-compose.yml)
npm install
npm run dev                   # http://localhost:3000
npm run build                 # build de producción
npm run lint                  # ESLint (eslint-config-next)
npm run typecheck             # tsc --noEmit
npm run test:e2e              # suite E2E completa (ver sección Testing)
```

## Estructura de carpetas

```
app/
  page.tsx                        # Orquesta ScreenCaptureApp + RecordingsList, hace fetch inicial
  layout.tsx                      # Fuentes (next/font/google) y metadata
  globals.css                     # Design tokens (paleta "capture stage") sobre Tailwind 4
  components/
    ScreenCaptureApp.tsx          # 'use client': captura, preview, MediaRecorder, guardar
    RecordingsList.tsx            # 'use client': listado + reproducción
  api/
    recordings/route.ts           # GET (listar) / POST (guardar metadatos)
    upload-url/route.ts           # POST: URL prefirmada para subida directa a S3
lib/
  env.ts                          # Validación de variables de entorno (zod), falla rápido al boot
  s3.ts                           # Cliente S3, autoprovisión de bucket, CORS, política pública, URL prefirmada
  mongodb.ts                      # Conexión cacheada (evita reconectar en cada invocación)
  types.ts                        # RecordingDocument (Mongo) / RecordingDto (API)
tests/e2e/                        # Playwright — ver Testing
docker-compose.yml                # Mongo + RustFS para desarrollo local
docker-compose.test.yml           # Stack efímero (puertos distintos) para E2E
scripts/test-e2e.sh               # Orquesta el ciclo de vida completo del E2E
```

## Variables de entorno

Referencia completa en `.env.example` (local + producción comentada). Copia
a `.env.local` para desarrollar — **nunca commitees `.env.local`** (ya está
en `.gitignore`; solo `.env.example` y `.env.test`, con placeholders, van al
repo). `lib/env.ts` valida todo al importarse por primera vez: si falta o es
inválida una variable, el arranque falla con un mensaje claro en vez de
propagar `undefined` a un cliente de S3 o Mongo.

## Convenciones de código

- TypeScript estricto (`strict: true`), sin `any` salvo necesidad justificada.
- Componentes cliente (`'use client'`) solo donde hay estado/efectos/APIs de
  navegador (captura, formularios). `page.tsx` es cliente porque coordina el
  estado compartido de ambos; las rutas de `app/api/**` son siempre servidor.
- Errores: cada operación de red en el cliente (`fetch`) se captura y
  traduce a un mensaje en español orientado al usuario, nunca un stack trace
  crudo. Las API routes devuelven `{ error: string }` con el status HTTP
  correcto (400 validación, 502 backend de storage caído, etc.).
- Commits: mensajes cortos en imperativo, en español o inglés indistintamente
  pero consistente por commit; sin firmas automáticas salvo que la
  herramienta las añada.
- No introduzcas abstracciones (hooks genéricos, capas de servicio) que no
  estén ya justificadas por un segundo caso de uso real en el código.

## Reglas específicas del dominio

- **La subida de vídeo siempre va directo del navegador al storage S3** vía
  `PUT` a una URL prefirmada (`POST /api/upload-url`). El servidor nunca
  recibe el binario. No añadas un endpoint que reciba el `Blob` en el body.
- **Los metadatos nunca incluyen el binario** — solo `description`, `s3Key`,
  `s3Url`, `createdAt`.
- **El bucket se autoprovisiona** (`ensureBucketExists` en `lib/s3.ts`):
  `HeadBucket` → `CreateBucket` si falta, y de paso configura CORS
  (necesario porque la subida es cross-origin navegador→storage) y una
  política de lectura pública (necesario porque `RecordingsList` reproduce
  con `<video src={s3Url}>` sin firmar). Si cambias el bucket o el backend de
  storage, esta lógica debe seguir aplicándose — no la saltes a mano.
- El cliente S3 (`lib/s3.ts`) está escrito para funcionar igual contra
  RustFS (local) y Cloudflare R2 (producción) cambiando solo variables de
  entorno — no bifurques el código por entorno.

## Qué NO hacer

- No crear un `README.md` nuevo — ya existe y solo se actualiza en la fase
  de despliegue (ver `PROMT.md`, Fase 14). No lo sobrescribas.
- No exponer credenciales de S3/Mongo en código cliente, salvo lo
  estrictamente necesario para que el navegador arme la URL prefirmada (que
  ya viaja firmada y con expiración, nunca la secret key en sí).
- No romper el flujo 100% local: cualquier cambio debe seguir funcionando
  con `docker compose up -d` + `.env.local` desde `.env.example`, sin
  depender de servicios de producción (Atlas, R2, Vercel).
- No hagas que los tests E2E dependan de un selector nativo de pantalla real
  — usa el mock de `tests/e2e/support/mock-display-media.ts`.

## Testing

`npm run test:e2e` (implementado en `scripts/test-e2e.sh`) hace, en orden:

1. Levanta un stack Docker efímero y aislado del de desarrollo
   (`docker-compose.test.yml`: Mongo en `27018`, RustFS en `9101`/`9102`).
2. Construye la app con `.env.test` (`next build`) y la arranca en el puerto
   `3100` (`next start`).
3. Ejecuta Playwright (`playwright.config.ts`, `testDir: tests/e2e`) contra
   ese servidor real.
4. Destruye el servidor y el stack Docker siempre, incluso si algo falla
   (`trap ... EXIT` en el script) — nunca deja contenedores ni datos de test
   huérfanos, y nunca toca los datos de desarrollo.

En GitLab CI (`.gitlab-ci.yml`, job `test:e2e`) el mismo objetivo se logra
de otra forma: `services:` nativos (`mongo:7` + `rustfs/rustfs:latest`
como contenedores hermanos) en vez de `docker compose`, porque el único
runner en línea de esta instancia no soporta Docker-in-Docker — ver Fase
12 más abajo para el porqué. Si tocas `scripts/test-e2e.sh`, revisa si el
cambio también aplica al job de CI (y viceversa); no comparten código,
solo el objetivo.

Por qué no se automatiza el selector nativo: `getDisplayMedia()` abre un
diálogo del sistema operativo que no se puede pilotar de forma fiable en
headless/CI. La cobertura principal sustituye
`navigator.mediaDevices.getDisplayMedia` (vía `page.addInitScript`, antes de
cargar la página) por un `MediaStream` sintético generado con
`<canvas>.captureStream()` — real para `MediaRecorder`, que sigue
codificando `webm` de verdad, así que el resto del pipeline (subida real a
RustFS, inserción real en Mongo, listado, reproducción) se ejercita sin
mocks adicionales.

Casos cubiertos:

- `tests/e2e/recording-flow.spec.ts` — estado inicial; flujo completo
  grabar → preview en vivo → detener → preview de resultado → guardar →
  aparece en el listado sin recargar; reproducción de la grabación guardada.
- `tests/e2e/errors.spec.ts` — el usuario cancela el selector (mock que
  rechaza la promesa) → error claro, UI sigue usable; fallo simulado de
  subida a S3 (`page.route` intercepta el `PUT` a storage) → error claro y
  **no** se crea metadata huérfana (se verifica contra `GET /api/recordings`).
- `tests/e2e/api.spec.ts` — pruebas de integración directas sobre
  `GET`/`POST /api/recordings` y `POST /api/upload-url`.
- `tests/e2e/real-picker.smoke.spec.ts` — smoke opcional y no bloqueante
  contra el selector **real** de Chromium (`--use-fake-ui-for-media-stream`),
  desactivado por defecto (`RUN_REAL_PICKER_SMOKE=1` para activarlo bajo
  Xvfb); documentado ahí mismo por qué no corre en el pipeline por defecto.

Comandos sueltos útiles al iterar en tests:

```bash
npm run test:e2e:stack:up     # solo levantar Mongo+RustFS de test
npm run test:e2e:stack:down   # solo destruirlo
npm run test:e2e:ui           # Playwright UI mode (con el stack ya orquestado)
```

## Estado del plan (Bloque 1 vs. Bloque 2)

Bloque 1 de `PROMT.md` (Fases 0–9) está completo: app 100% funcional en
local, con `AGENTS.md` y E2E incluidos.

Bloque 2 (Fases 10–14) está en marcha:

- **Fase 10 (R2)** — `lib/s3.ts` funciona contra RustFS y R2 sin cambio de
  lógica, solo de variables de entorno, **con dos excepciones importantes**
  en `ensureBucketExists`, ambas best-effort (avisan por consola y siguen
  en vez de romper la subida si fallan):
  - `PutBucketPolicy` (lectura pública): R2 **no implementa esta operación
    en absoluto**, la acepte el token que la acepte. La lectura pública en
    R2 se activa una vez, a mano, desde el dashboard del bucket
    (**Settings → Public access**: R2.dev subdomain o dominio propio).
  - `PutBucketCors`: R2 sí la implementa, pero es una operación de
    administración de bucket — **requiere un token con permiso "Admin
    Read & Write"**. Un token "Object Read & Write" con scope a un solo
    bucket (el que recomendamos por mínimo privilegio) recibe 403 aquí.
    Con ese tipo de token, configura el CORS del bucket a mano una vez
    desde **R2 → bucket → Settings → CORS Policy**, con `AllowedOrigins`
    apuntando al dominio real de producción (el valor de `S3_CORS_ORIGIN`).
  Decisión tomada: **bucket de lectura pública** (no URLs firmadas de
  lectura), porque el flujo actual reproduce con `<video src={s3Url}>` sin
  firmar — mantiene la arquitectura simple para vídeos que no son
  sensibles. Si en el futuro se necesita contenido privado,
  `RecordingsList`/`GET /api/recordings` tendrían que generar una URL
  firmada de lectura por grabación en cada listado, ya que las firmadas
  expiran y no se pueden guardar como `s3Url` estático en Mongo.
- **Fase 11 (Atlas)** — `lib/mongodb.ts` no necesita cambios: la cadena
  `mongodb+srv://...` de Atlas es solo otro valor de `MONGODB_URI`.
- **Fase 12 (GitLab CI)** — `.gitlab-ci.yml` implementado: `install → lint →
  build → test:e2e → deploy:gate`. `install`, `lint` (incluye `next
  typegen`, necesario porque un checkout limpio no trae `.next/types/` y
  `tsc` necesita el tipo ambiental `LayoutProps`) y `build` corren de
  forma fiable en el único runner en línea de esta instancia
  (`cloudrun-ephemeral`, ver `glab api runners/all`) y **sí bloquean**
  `deploy:gate`.

  `test:e2e` es la excepción: **no bloquea** (`allow_failure: true`).
  Localmente (`scripts/test-e2e.sh`) el E2E completo pasa en verde de
  extremo a extremo contra Mongo + RustFS reales vía `docker compose` —
  ese es el criterio de aceptación real de la Fase 9. En CI se intentó
  primero Docker-in-Docker (`docker:dind`) y falló (`lookup docker ...
  no such host`); se cambió a `services:` nativos de GitLab (`mongo:7` +
  `rustfs/rustfs:latest` como contenedores hermanos, sin modo
  privilegiado), y **también falla**: la resolución DNS de los alias de
  servicio no funciona en este runner en absoluto
  (`getaddrinfo EAI_AGAIN mongo` / `rustfs`). Es una limitación de la
  infraestructura de este runner compartido (el runner que sí estaba
  pensado para esto, `vps-dind-shared`, lleva meses offline), no un bug
  del código ni de la suite — si en el futuro se revive ese runner o se
  arregla el networking del actual, el job ya está listo tal cual está
  escrito, sin cambios. Localmente sigue siendo `docker compose` vía
  `scripts/test-e2e.sh`; CI usa `services:` nativos — son dos mecanismos
  distintos para el mismo objetivo, no dupliques lógica entre ambos si
  los tocas. El pipeline **nunca** corre contra Atlas/R2 de producción.
  `build` usa `.env.test` (placeholders versionados) solo para
  satisfacer la validación de `lib/env.ts` al compilar; no es un deploy.
  Estrategia de deploy adoptada: **mirror de GitLab a GitHub +
  integración nativa de Vercel con GitHub** — la integración nativa
  Vercel↔GitLab solo soporta GitHub, GitLab.com y Bitbucket, y este repo
  vive en un GitLab autoalojado (`gitlab.codecrypto.academy`) que Vercel no
  reconoce como proveedor Git nativo, así que en vez de desplegar desde el
  pipeline (CLI de Vercel + `VERCEL_TOKEN` en GitLab) se configuró un
  *push mirror* de este repo hacia GitHub (GitLab → Settings → Repository →
  Mirroring repositories) y el proyecto de Vercel se importó nativamente
  desde ese mirror de GitHub — Vercel despliega solo en cada push que el
  mirror reenvía, fuera de GitLab por completo. `deploy:gate` no despliega
  nada: es el quality gate que la protección de rama exige en verde antes
  de mergear a `main`. GitLab CI no necesita ningún token de Vercel; las
  variables de entorno de producción (`MONGODB_URI`, `S3_*`) viven
  únicamente en Vercel (Project Settings → Environment Variables).
- **Fase 13 (despliegue)** — pendiente de credenciales reales (Atlas, R2,
  Vercel, dominio); ver la guía paso a paso que se compartió en el chat
  para generarlas.
- **Fase 14 (README)** — pendiente hasta que haya una URL pública real que
  documentar.
