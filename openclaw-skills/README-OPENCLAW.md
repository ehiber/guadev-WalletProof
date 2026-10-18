# OpenClaw y Blinka Guard

OpenClaw ya está configurado. Este directorio no reinstala el gateway, el túnel ni los canales.

`PROMPT.md` se pega en ese OpenClaw. Crea la skill `blinka-ingest-invoice` y, si faltan, las variables `BLINKA_WEBHOOK_URL` y `BLINKA_WEBHOOK_SECRET`. Antes de pegarlo, pon en la URL el origen público de Blinka seguido de `/api/webhooks/openclaw`. El secreto lo eliges tú y no se guarda en este repositorio.

La skill entrega la foto, el PDF o el texto a `POST /api/webhooks/openclaw`. No aprueba ni rechaza. El mismo valor de `BLINKA_WEBHOOK_SECRET` va en el servidor como `OPENCLAW_WEBHOOK_SECRET`.

El archivo no puede pasar de 4 MB. Sin adjunto se omiten `media`, `mime` y `filename`. Con respuesta 200, el chat dice solo que el envío quedó en la bandeja y, si viene, el `invoice.id`.
