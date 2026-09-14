# 🎥 Screen Capture — Grabación de Pantalla con Next.js + S3 + MongoDB

## 🎯 Objetivo del proyecto

Construir una aplicación que **graba la pantalla desde el navegador**, sube el vídeo a un almacenamiento S3 compatible (RustFS) y guarda los metadatos en MongoDB.

Con este proyecto el alumno aprende:

- Las **APIs multimedia del navegador**: `getDisplayMedia()` y `MediaRecorder`.
- A trabajar con **Blobs** y vídeo en formato `webm`.
- La **subida directa desde el cliente** a un storage S3 compatible.
- A combinar storage de objetos (vídeos) con base de datos (metadatos).

## 🏗️ Arquitectura

```
┌────────────────────────────┐    upload webm     ┌─────────────────┐
│  Navegador                 │ ─────────────────► │  RustFS (S3)    │
│  getDisplayMedia()         │                    │  localhost:9001 │
│  MediaRecorder → Blob      │                    └─────────────────┘
│                            │    POST metadata   ┌─────────────────┐
│                            │ ─────────────────► │ /api/recordings │
└────────────────────────────┘                    │   → MongoDB     │
                                                  └─────────────────┘
```

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Captura | `navigator.mediaDevices.getDisplayMedia()` + `MediaRecorder` |
| Storage de vídeo | RustFS (S3 compatible) vía `@aws-sdk/client-s3` |
| Metadatos | MongoDB (driver nativo), BD `screen-capture` |

### Estructura de carpetas

```
app/
  page.tsx                          # Página principal
  components/ScreenCaptureApp.tsx   # Captura, preview y subida ('use client')
  components/RecordingsList.tsx     # Listado de grabaciones
  api/recordings/route.ts           # GET (listar) + POST (guardar metadatos)
```

## ⚙️ Funcionalidades

- **Iniciar/Detener grabación**: el usuario elige pantalla o ventana en el diálogo del navegador.
- **Preview en vivo** durante la grabación (`<video srcObject={stream} autoPlay />`).
- **Preview del resultado** al detener (Blob en `webm`).
- **Descripción** asociada a cada grabación.
- **Guardar**: sube el vídeo a S3 con nombre único (`${Date.now()}-${uuid}.webm`) y persiste los metadatos en MongoDB.
- **Listado de grabaciones** con reproducción.

## 💡 Solución

1. La grabación vive enteramente en el **cliente** (`'use client'`): `getDisplayMedia()` devuelve un `MediaStream` que `MediaRecorder` va troceando en chunks; al parar, los chunks se unen en un `Blob` de tipo `video/webm`.
2. La **subida va directa del navegador a RustFS** — el servidor no actúa de intermediario para el binario, lo que evita cargar el backend con ficheros grandes. El bucket se crea automáticamente si no existe.
3. Solo los **metadatos** pasan por la API (`POST /api/recordings`): `{ description, s3Key, s3Url, createdAt }`. MongoDB devuelve el `_id` insertado como confirmación.
4. El cliente S3 se configura con `endpoint` propio y `forcePathStyle: true`, necesario para servidores S3 compatibles como RustFS o MinIO.

### Flujo de uso

1. Escribe una descripción (opcional) → pulsa **Iniciar** → elige pantalla/ventana.
2. Graba → pulsa **Detener** → revisa el preview.
3. Pulsa **Guardar** → el vídeo sube a S3 y los metadatos a MongoDB.
4. La grabación aparece en el listado, lista para reproducir.

## 🚀 Cómo ejecutar

1. Arranca MongoDB local y RustFS en Docker (puerto 9001).
2. Crea `.env.local`:

```env
S3_ENDPOINT=http://localhost:9001
S3_ACCESS_KEY=rustfsadmin
S3_SECRET_KEY=rustfsadmin
S3_BUCKET=recordings
MONGODB_URI=mongodb://localhost:27017/screen-capture
```

3. Instala y arranca:

```bash
npm install
npm run dev
```

4. Abre [http://localhost:3000](http://localhost:3000). El navegador pedirá permiso para compartir pantalla.

## 🌐 Despliegue

La app está desplegada en producción: **[https://screen-capture.jpavon-tech.com](https://screen-capture.jpavon-tech.com)**

**Arquitectura de producción:**

| Capa | Servicio |
|------|----------|
| Frontend + API | [Vercel](https://vercel.com) |
| Base de datos | [MongoDB Atlas](https://www.mongodb.com/atlas) |
| Storage de vídeo | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3 compatible) |
| Dominio | propio, gestionado en Cloudflare |

**CI/CD**: cada push dispara un pipeline en GitLab CI (`.gitlab-ci.yml`) que valida, en orden, `lint` + `typecheck` → `build` → la suite E2E de Playwright completa (contra un stack Docker efímero, nunca contra los servicios de producción) antes de dar luz verde a `main`. El repositorio se sincroniza mediante *push mirror* a GitHub, desde donde Vercel despliega automáticamente en cada push. Detalle técnico completo del pipeline y de la estrategia de despliegue en [`AGENTS.md`](./AGENTS.md).

<!-- BEGIN cc:que-se-valora -->
¡Hola! Para que tengas claro qué busco cuando corrija tu proyecto "Video Capture", te he preparado esta sección. Así sabes dónde poner el foco.

## 📋 Qué se valora

Cuando revise tu proyecto, me fijaré mucho en que **todo lo que pide el enunciado funcione correctamente**, porque eso es lo que más pesa en la nota. También le daré bastante importancia a que **tu código esté bien organizado y sea fácil de entender**, y a que **el vídeo demo muestre claramente todo lo que has hecho**. Por último, aunque con un peso menor, miraré que **expliques bien tus decisiones y cómo has resuelto los problemas**.

Recuerda que el enunciado es la guía principal, y la evaluación no te penalizará por cosas que no se pidan explícitamente en él.
<!-- END cc:que-se-valora -->
