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
  lógica, solo de variables de entorno, **con una excepción importante**:
  R2 no implementa `PutBucketPolicy` (sí `PutBucketCors`). `ensureBucketExists`
  intenta configurar la política de lectura pública y, si el backend la
  rechaza, registra un aviso y continúa en vez de romper la subida — en R2
  la lectura pública se activa una vez, a mano, desde el dashboard
  (Public Development URL o dominio propio en el bucket), no vía API en
  cada request. Decisión tomada: **bucket de lectura pública** (no URLs
  firmadas de lectura), porque el flujo actual reproduce con
  `<video src={s3Url}>` sin firmar — mantiene la arquitectura simple para
  vídeos que no son sensibles. Si en el futuro se necesita contenido
  privado, `RecordingsList`/`GET /api/recordings` tendrían que generar una
  URL firmada de lectura por grabación en cada listado, ya que las firmadas
  expiran y no se pueden guardar como `s3Url` estático en Mongo.
- **Fase 11 (Atlas)** — `lib/mongodb.ts` no necesita cambios: la cadena
  `mongodb+srv://...` de Atlas es solo otro valor de `MONGODB_URI`.
- **Fase 12 (GitLab CI)** — `.gitlab-ci.yml` implementado: `install → lint →
  build → test:e2e → deploy`. `test:e2e` corre Docker-in-Docker (imagen
  `mcr.microsoft.com/playwright`, servicio `docker:27-dind`) para levantar
  el mismo stack efímero que en local — el pipeline **nunca** corre contra
  Atlas/R2 de producción. `build` usa `.env.test` (placeholders versionados)
  solo para satisfacer la validación de `lib/env.ts` al compilar; no es un
  deploy. Estrategia de deploy adoptada: **CLI de Vercel desde el propio
  pipeline** (`vercel pull` → `vercel build` → `vercel deploy --prebuilt`),
  **no** la integración nativa Vercel↔GitLab — esa integración nativa solo
  soporta GitHub, GitLab.com y Bitbucket, y este repo vive en un GitLab
  autoalojado (`gitlab.codecrypto.academy`), que Vercel no reconoce como
  proveedor Git nativo. `deploy:production` corre en `main`;
  `deploy:preview` corre manual en otras ramas. Requiere `VERCEL_TOKEN`
  (enmascarada + protegida), `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` como
  variables de CI/CD de GitLab — se obtienen enlazando el proyecto una vez
  con `vercel link` (ver guía de despliegue compartida en el chat). Las
  variables de entorno de producción en sí (`MONGODB_URI`, `S3_*`) viven
  solo en Vercel (Project Settings → Environment Variables), nunca en
  GitLab CI.
- **Fase 13 (despliegue)** — pendiente de credenciales reales (Atlas, R2,
  Vercel, dominio); ver la guía paso a paso que se compartió en el chat
  para generarlas.
- **Fase 14 (README)** — pendiente hasta que haya una URL pública real que
  documentar.
