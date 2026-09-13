# Prompt de implementación por fases — Screen Capture (Next.js + S3/RustFS + MongoDB)

> Copia este documento completo como prompt inicial para el agente que va a implementar el proyecto. Está pensado para ejecutarse fase por fase, verificando cada una antes de avanzar a la siguiente.

## Rol y contexto

Eres un ingeniero de software senior encargado de implementar, de principio a fin, una aplicación web que graba la pantalla desde el navegador, sube el vídeo a un almacenamiento compatible con S3 y guarda los metadatos en MongoDB.

Arquitectura ya decidida (no la cuestiones, impleméntala):

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4.
- **Captura**: `navigator.mediaDevices.getDisplayMedia()` + `MediaRecorder`, enteramente en cliente (`'use client'`). El stream se trocea en chunks y al detener la grabación se unen en un `Blob` `video/webm`.
- **Storage de vídeo**: almacenamiento S3-compatible vía `@aws-sdk/client-s3`, con subida **directa desde el navegador** (el backend no intermedia el binario). En local: RustFS (`localhost:9001`, `forcePathStyle: true`). El bucket se crea automáticamente si no existe.
- **Metadatos**: MongoDB (driver nativo), base de datos `screen-capture`. Solo pasan por la API (`POST /api/recordings`) el `{ description, s3Key, s3Url, createdAt }`. MongoDB devuelve el `_id` insertado como confirmación.
- **Estructura de carpetas**:
  ```
  app/
    page.tsx                       # Página principal
    components/ScreenCaptureApp.tsx   # Captura, preview y subida ('use client')
    components/RecordingsList.tsx     # Listado de grabaciones
    api/recordings/route.ts           # GET (listar) + POST (guardar metadatos)
  ```
- **Funcionalidades**: iniciar/detener grabación con selector nativo de pantalla/ventana; preview en vivo (`<video srcObject={stream} autoPlay />`); preview del resultado al detener; descripción asociada; guardar (sube a S3 con nombre único `${Date.now()}-${uuid}.webm` y persiste metadatos); listado de grabaciones con reproducción.

No crees un `README.md` nuevo: **ya existe uno en el repositorio** y solo se actualizará en la fase final de despliegue (ver Fase 13). No lo sobrescribas antes de esa fase.

## Reglas de trabajo

1. Trabaja **fase por fase**, en el orden indicado. No empieces una fase sin haber cerrado los criterios de aceptación de la anterior.
2. Al terminar cada fase, resume brevemente qué se hizo, qué archivos se tocaron, y confirma los criterios de aceptación antes de continuar.
3. El proyecto está dividido en dos bloques con una **puerta de confirmación obligatoria** entre ambos:
   - **Bloque 1 (Fases 0–9): la app debe funcionar al 100% en local.** No se avanza al Bloque 2 sin esto confirmado explícitamente.
   - **Bloque 2 (Fases 10–13): CI/CD y despliegue público.**
4. Nunca commitees secretos reales (`.env.local`, tokens, API keys). Solo `.env.example` con placeholders va al repositorio.
5. Si en algún punto falta información indispensable para continuar (credenciales, nombres exactos, decisiones de negocio), detente y pregunta en vez de asumir.

---

# BLOQUE 1 — Funcionalidad local al 100%

## Fase 0 — Scaffolding del proyecto

- Verifica/crea el proyecto Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + ESLint.
- Configura `tsconfig.json`, `next.config.ts`, `tailwind.config` según convenciones actuales de Tailwind 4.
- Instala dependencias necesarias: `@aws-sdk/client-s3`, `mongodb` (driver nativo), `uuid`.
- **Criterios de aceptación**: `npm run dev` levanta la app sin errores en `http://localhost:3000`.

## Fase 1 — Estructura de carpetas y esqueleto de componentes

- Crea la estructura de carpetas exactamente como se describe en el contexto (`app/page.tsx`, `app/components/ScreenCaptureApp.tsx`, `app/components/RecordingsList.tsx`, `app/api/recordings/route.ts`).
- Deja componentes con estructura básica (props, estado inicial) sin lógica completa todavía.
- **Criterios de aceptación**: la app compila y renderiza una página principal con los componentes vacíos montados.

## Fase 2 — Variables de entorno y `.env.example`

Planea y crea un archivo `.env.example` en la raíz con las variables necesarias para todos los entornos (local ahora; producción se documenta pero no se usa hasta el Bloque 2):

```bash
# --- Storage S3-compatible ---
# Local: RustFS. Producción: Cloudflare R2 (ver Fase 12)
S3_ENDPOINT=http://localhost:9001
S3_ACCESS_KEY=rustfsadmin
S3_SECRET_KEY=rustfsadmin
S3_BUCKET=recordings
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
# URL pública base para servir los objetos (local: el propio endpoint; prod: dominio de R2 o CDN)
S3_PUBLIC_URL=http://localhost:9001/recordings

# --- Base de datos ---
# Local: MongoDB en Docker. Producción: MongoDB Atlas (ver Fase 12)
MONGODB_URI=mongodb://localhost:27017/screen-capture

# --- App ---
NODE_ENV=development
```

- Añade `.env.local` a `.gitignore` (si no está ya).
- **Criterios de aceptación**: `.env.example` versionado, sin secretos reales; `.env.local` (con valores reales locales) ignorado por git; la app lee estas variables mediante un módulo central de configuración (por ejemplo `lib/env.ts`) que valida que existan al arrancar.

## Fase 3 — Cliente S3 y helper de storage

- Implementa un módulo (`lib/s3.ts`) que configure el cliente `@aws-sdk/client-s3` con `endpoint`, `forcePathStyle: true`, credenciales y región desde las variables de entorno.
- Lógica de creación automática del bucket si no existe (`HeadBucket` → `CreateBucket` si falla).
- Función para generar una URL de subida directa desde el cliente (evalúa `PutObjectCommand` con SDK en cliente vía credenciales temporales, o bien un endpoint propio que devuelva una **URL prefirmada** (`getSignedUrl`) para que el navegador suba directo a S3 sin pasar el binario por el backend — mantiene el principio "la subida no intermedia el binario en el servidor").
- **Criterios de aceptación**: existe un endpoint/función para obtener una URL de subida prefirmada; el bucket se autoprovisiona en el primer uso.

## Fase 4 — API de metadatos (`/api/recordings`)

- `POST /api/recordings`: recibe `{ description, s3Key, s3Url }`, añade `createdAt`, inserta en MongoDB, devuelve `{ _id, ...doc }`.
- `GET /api/recordings`: devuelve el listado ordenado por `createdAt` descendente.
- Implementa un módulo de conexión a MongoDB (`lib/mongodb.ts`) con patrón de conexión cacheada (evitar reconectar en cada invocación, importante en serverless).
- Validación básica de payload (con `zod` u otra librería ligera, o validación manual).
- **Criterios de aceptación**: pruebas manuales con `curl`/Postman de ambos endpoints funcionando contra MongoDB local.

## Fase 5 — Captura de pantalla en el cliente

- Implementa en `ScreenCaptureApp.tsx` el flujo completo:
  - Botón "Iniciar" → `getDisplayMedia({ video: true, audio: true })` → selector nativo del navegador.
  - Preview en vivo con `<video srcObject={stream} autoPlay />`.
  - `MediaRecorder` troceando en chunks (`ondataavailable`).
  - Botón "Detener" → `chunks` se unen en `Blob` tipo `video/webm` → preview del resultado.
  - Campo de texto para la descripción (opcional).
  - Manejo de estados: idle / grabando / preview / subiendo / error.
  - Manejo de errores: usuario cancela el selector, permiso denegado, navegador no soportado.
- **Criterios de aceptación**: se puede grabar pantalla, ver preview en vivo, detener y ver preview del resultado, todo sin errores en consola.

## Fase 6 — Guardar: subida a S3 + persistencia de metadatos

- Botón "Guardar": genera nombre único `${Date.now()}-${uuid}.webm`, sube el `Blob` directo al storage S3 (usando la URL prefirmada de la Fase 3), y al confirmar la subida hace `POST /api/recordings` con la descripción y las referencias (`s3Key`, `s3Url`).
- Feedback visual de progreso/éxito/error.
- **Criterios de aceptación**: al guardar, el vídeo aparece en el bucket (verificable en la consola de RustFS) y el documento aparece en MongoDB.

## Fase 7 — Listado y reproducción

- `RecordingsList.tsx` consume `GET /api/recordings` y renderiza tarjetas con descripción, fecha y un `<video controls src={s3Url} />` para reproducir.
- Refresco del listado tras guardar una nueva grabación (sin recargar la página).
- **Criterios de aceptación**: toda grabación guardada aparece en el listado y es reproducible.

## Fase 8 — Planeación y creación de `AGENTS.md`

Crea un archivo `AGENTS.md` en la raíz del repositorio, dirigido a agentes de codificación (Claude Code, Cursor, Codex, etc.) que trabajen sobre este proyecto en el futuro. Debe incluir, de forma concisa:

- **Resumen del proyecto** (1 párrafo) y arquitectura (referencia a este documento de planeación en lugar de repetir todo).
- **Stack técnico** exacto (Next.js 16, React 19, Tailwind 4, MongoDB, S3/RustFS).
- **Comandos**: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` (definidos en Fase 9), y cómo levantar las dependencias locales (`docker compose up -d`).
- **Estructura de carpetas** con una línea de propósito por archivo/carpeta clave.
- **Variables de entorno**: referencia a `.env.example`, nunca commitear `.env.local`.
- **Convenciones de código**: TypeScript estricto, componentes cliente vs servidor, manejo de errores, estilo de commits.
- **Reglas específicas del dominio**: la subida de vídeo siempre va directo del cliente al storage (nunca por el backend); los metadatos nunca incluyen el binario; el bucket se autoprovisiona.
- **Qué NO hacer**: no crear un nuevo `README.md` (ya existe), no exponer credenciales en el cliente salvo las estrictamente necesarias para URLs prefirmadas, no romper el flujo 100% local.
- **Testing**: cómo correr los E2E (Fase 9) y qué cubren.

- **Criterios de aceptación**: `AGENTS.md` versionado y actualizado conforme avancen las fases posteriores (CI/CD, despliegue).

## Fase 9 — Planeación del E2E Testing (Playwright)

Playwright ya está disponible en el entorno de desarrollo; úsalo como framework de E2E.

**Reto específico de este proyecto**: `getDisplayMedia()` requiere un diálogo nativo de selección de pantalla que no se puede automatizar de forma confiable ni en CI headless. Estrategia recomendada:

1. **Mocking de MediaDevices/MediaRecorder** (cobertura principal): mediante `page.addInitScript()`, inyectar un `navigator.mediaDevices.getDisplayMedia` falso que devuelva un `MediaStream` sintético (por ejemplo generado desde un `<canvas>.captureStream()`), y validar que el flujo completo de la UI (iniciar → preview en vivo → detener → preview de resultado → guardar → aparece en listado → reproduce) funciona de extremo a extremo contra el backend real (API + Mongo + storage de test).
2. **Smoke test opcional con flags de Chromium** (`--use-fake-ui-for-media-stream`, `--auto-select-desktop-capture-source="Entire screen"` bajo Xvfb) para al menos un flujo feliz cercano a condiciones reales, ejecutado por separado (puede marcarse como opcional/no bloqueante en CI si resulta inestable).
3. **Entorno de test aislado**: stack Docker Compose específico para test (Mongo + RustFS efímeros, o *testcontainers*), levantado antes de correr Playwright contra `next build && next start`, y destruido al terminar. Nunca correr E2E contra datos de desarrollo persistentes.

**Casos a cubrir**:

- Carga de la página principal y estado inicial de la UI.
- Flujo completo: iniciar grabación (mock) → preview en vivo visible → detener → preview de resultado visible.
- Guardar: el vídeo se sube al bucket de test, se crea el documento en Mongo, y la nueva grabación aparece en el listado sin recargar.
- Reproducción de una grabación existente desde el listado.
- Manejo de error: el usuario cancela el selector de pantalla (mock que rechaza la promesa) → la UI muestra un estado de error claro y no rompe.
- Manejo de error: fallo simulado de subida a S3 → la UI informa el error y no crea metadatos huérfanos.
- (Opcional) Validación directa de los endpoints `GET`/`POST /api/recordings` como pruebas de integración, complementarias a los E2E de UI.

**Criterios de aceptación**: suite de Playwright (`tests/e2e/`) documentada en `AGENTS.md`, ejecutable con un solo comando (`npm run test:e2e`), reproducible en local y lista para integrarse en el pipeline de CI (Fase 10).

## ⛔ Puerta de confirmación — cierre del Bloque 1

Antes de continuar al Bloque 2, confirma explícitamente:

- [ ] La app corre 100% en local siguiendo el flujo de "Cómo ejecutar" (Docker para Mongo + RustFS, `.env.local` a partir de `.env.example`, `npm install && npm run dev`).
- [ ] Los 4 flujos funcionales (grabar, preview, guardar, listar/reproducir) funcionan manualmente sin errores.
- [ ] La suite de E2E pasa en local.
- [ ] `AGENTS.md` y `.env.example` están al día.

No avances a la Fase 10 sin marcar todo lo anterior.

---

# BLOQUE 2 — CI/CD y despliegue público

**Decisiones ya tomadas para este bloque** (no las cuestiones):

- **Storage en producción**: Cloudflare R2 (S3-compatible), en lugar de RustFS.
- **Repositorio / CI**: GitLab, con pipeline en GitLab CI/CD (`.gitlab-ci.yml`).
- **Base de datos en producción**: MongoDB Atlas (ya existe la cuenta).
- **Hosting del frontend**: Vercel (ya existe la cuenta).
- **Dominio**: Cloudflare (ya existe el dominio); el subdominio exacto para esta app aún no está decidido — propón uno razonable (por ejemplo `screen-capture.<tu-dominio>.com` o `grabador.<tu-dominio>.com`) y decláralo explícitamente en el resumen de esta fase.

## Fase 10 — Adaptar el storage para producción (Cloudflare R2)

- Generaliza `lib/s3.ts` para que funcione igual contra RustFS (local) y R2 (prod) cambiando solo variables de entorno: R2 usa `endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `region: "auto"`, y normalmente **no** requiere `forcePathStyle` (verificar comportamiento real y ajustar si el SDK lo exige).
- Añade a `.env.example` las variables equivalentes para R2 (comentadas como "producción"): `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION=auto`.
- Decide y documenta la estrategia de acceso a los vídeos guardados en R2: bucket público de solo lectura vs. URLs firmadas de lectura (recomendado si el contenido no debe ser público). Ajusta `S3_PUBLIC_URL` / lógica de generación de URL de reproducción según lo decidido.
- **Criterios de aceptación**: el mismo código sirve para local (RustFS) y producción (R2) sin cambios de lógica, solo de configuración.

## Fase 11 — Adaptar MongoDB para producción (Atlas)

- Verifica que `lib/mongodb.ts` funcione igual contra `mongodb://localhost:27017/...` y contra una connection string de Atlas (`mongodb+srv://...`), sin cambios de código.
- Documenta en `.env.example` el formato esperado para Atlas (comentado, sin credenciales reales).
- **Criterios de aceptación**: conexión exitosa a un cluster de Atlas usando solo variables de entorno.

## Fase 12 — Pipeline de CI/CD (GitLab CI)

Crea `.gitlab-ci.yml` con, al menos, las siguientes etapas:

1. **install**: cache de dependencias, `npm ci`.
2. **lint**: `npm run lint` + `tsc --noEmit` (typecheck).
3. **build**: `npm run build` (falla el pipeline si el build falla).
4. **test:e2e**: levanta el stack de test (Mongo + RustFS efímeros vía Docker-in-Docker o servicios de GitLab CI), corre `next start` contra ese stack, ejecuta la suite Playwright de la Fase 9. Publica el reporte de Playwright como artifact.
5. **deploy** (solo en la rama principal, tras pasar las etapas anteriores):
   - **Recomendado**: conectar el proyecto de Vercel directamente al repositorio de GitLab (Vercel tiene integración nativa con GitLab: despliega automáticamente previews por merge request y producción al mergear a la rama principal). En ese caso, la etapa `deploy` del pipeline de GitLab CI **no despliega**, solo actúa como *quality gate* obligatorio antes del merge (protección de rama + pipeline en verde como requisito).
   - **Alternativa**: si prefieres desplegar explícitamente desde GitLab CI (sin usar la integración Git nativa de Vercel), usa el `vercel` CLI con `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` como variables protegidas de CI/CD (`Settings → CI/CD → Variables`), ejecutando `vercel deploy --prod --token=$VERCEL_TOKEN`.
   - Documenta en `AGENTS.md` cuál de las dos estrategias se adoptó y por qué.
- Todas las variables de entorno de producción (Atlas URI, credenciales de R2, etc.) se configuran como **variables de entorno del proyecto en Vercel** (no en GitLab CI, salvo las necesarias para el propio deploy vía CLI si se elige esa alternativa) y como **variables protegidas/enmascaradas** en GitLab CI/CD donde aplique (por ejemplo, si el propio pipeline necesita correr contra Atlas para algo, cosa que debe evitarse: los tests E2E deben correr contra el stack local efímero, no contra Atlas).
- **Criterios de aceptación**: un push/MR dispara el pipeline; falla si lint/typecheck/build/E2E fallan; un merge a la rama principal produce un despliegue accesible.

## Fase 13 — Despliegue público y dominio

- Crea el proyecto en Vercel apuntando al repositorio de GitLab (o impórtalo manualmente si la integración directa no está disponible en el plan actual — en ese caso documenta el paso manual).
- Configura en Vercel las variables de entorno de producción: `MONGODB_URI` (Atlas), `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/`S3_REGION` (R2), `S3_PUBLIC_URL`.
- Propón y configura el subdominio en Cloudflare: agrega el dominio/subdominio en el proyecto de Vercel y crea el registro DNS correspondiente en Cloudflare (normalmente un `CNAME` hacia `cname.vercel-dns.com`, en modo **DNS only** — sin el proxy naranja activado — mientras Vercel emite el certificado; se puede reactivar el proxy después si se desea).
- Verifica que el dominio resuelve, sirve HTTPS válido, y que la app en producción funciona de extremo a extremo (grabar, guardar en R2, listar desde Atlas).
- **Criterios de aceptación**: la app es accesible públicamente vía el subdominio configurado, con HTTPS, y el flujo completo funciona contra los servicios de producción (Atlas + R2).

## Fase 14 — Actualizar el `README.md` original

- Edita el `README.md` ya existente en el repositorio (no lo reemplaces por completo) añadiendo una sección de **Despliegue** con:
  - La URL pública final.
  - Nota breve de la arquitectura de producción (Vercel + MongoDB Atlas + Cloudflare R2 + dominio propio vía Cloudflare).
  - Enlace/mención al pipeline de CI/CD y qué valida antes de cada despliegue.
- **Criterios de aceptación**: `README.md` refleja el estado real y desplegado del proyecto, sin duplicar contenido que ya esté en `AGENTS.md`.

---

## Checklist final

- [ ] Bloque 1 completo y confirmado (app 100% funcional en local, E2E en verde).
- [ ] `.env.example` cubre local y producción, sin secretos reales.
- [ ] `AGENTS.md` completo y actualizado.
- [ ] Pipeline de CI/CD en GitLab corriendo lint + typecheck + build + E2E en cada push/MR.
- [ ] Despliegue público accesible en el subdominio de Cloudflare, con HTTPS.
- [ ] `README.md` original actualizado con la URL de despliegue.