# OpenClaw y Blinka Guard

Las dos skills apuntan a `POST /api/webhooks/openclaw`.

El header `x-openclaw-secret` tiene que coincidir con `OPENCLAW_WEBHOOK_SECRET`. En la demo local, si esa variable no existe, el secreto es `blinka-demo`.

`GET` devuelve la bitácora viva (`globalThis.openclawEvents`, máximo 50 eventos del proceso). `DELETE` la vacía. El drawer del dashboard usa las tres rutas.
