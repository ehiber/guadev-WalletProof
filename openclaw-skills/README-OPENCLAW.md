# OpenClaw y Wallet Proof

OpenClaw ya está configurado. Este directorio no reinstala el gateway, el túnel ni los canales.

`PROMPT.md` se pega en ese OpenClaw. Crea la skill `blinka-ingest-invoice` y, si faltan, las variables `BLINKA_WEBHOOK_URL` y `BLINKA_WEBHOOK_SECRET`. Antes de pegarlo, pon en la URL el origen público de Wallet Proof seguido de `/api/webhooks/openclaw`. El secreto lo eliges tú y no se guarda en este repositorio.

La skill entrega la foto, el PDF o el texto con `curl` a `POST /api/webhooks/openclaw`. El shell expande `$BLINKA_WEBHOOK_SECRET` en el header `x-openclaw-secret`. El modelo no escribe ese valor. El mismo secreto va en el servidor como `OPENCLAW_WEBHOOK_SECRET`. La skill no aprueba ni rechaza.

El archivo no puede pasar de 4 MB. Sin adjunto se omiten `media`, `mime` y `filename`. Con respuesta 200, el chat dice solo que el envío quedó en la bandeja y, si viene, el `invoice.id`.
