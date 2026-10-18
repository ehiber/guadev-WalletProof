OpenClaw ya está configurado. No cambies el gateway, el túnel, los canales ni los tokens que ya existen.

Crea solo la skill blinka-ingest-invoice y estas variables, si todavía no existen:

BLINKA_WEBHOOK_URL=<origen público de Blinka>/api/webhooks/openclaw
BLINKA_WEBHOOK_SECRET=<genera un secreto largo y muéstralo una sola vez>

La skill hace POST a BLINKA_WEBHOOK_URL con el header x-openclaw-secret: BLINKA_WEBHOOK_SECRET y Content-Type application/json.

Cuando llegue una foto, un PDF o un texto de cobro, envía:

{
  "kind": "ingest",
  "payload": {
    "channel": "whatsapp",
    "text": "mensaje del usuario, tal cual",
    "media": "base64 del archivo, o data URL",
    "mime": "image/jpeg o application/pdf",
    "filename": "nombre del archivo"
  }
}

Si no hay archivo, omite media, mime y filename. El archivo no puede pasar de 4 MB. No apruebes, no rechaces y no calcules montos. Si el webhook responde 200, contesta solo que quedó recibido y, si viene invoice.id, inclúyelo. Si falla, di que no se pudo entregar.

Al terminar, responde únicamente con el nombre de la skill, BLINKA_WEBHOOK_URL y BLINKA_WEBHOOK_SECRET.
