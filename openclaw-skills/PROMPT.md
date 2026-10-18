OpenClaw ya está configurado. No cambies el gateway, el túnel, los canales ni los tokens que ya existen.

Actualiza solo la skill blinka-ingest-invoice. Las variables BLINKA_WEBHOOK_URL y BLINKA_WEBHOOK_SECRET tienen que existir en el entorno del proceso del gateway, no solo en el chat. La URL es el origen público de Blinka seguido de /api/webhooks/openclaw. El secreto es el mismo valor que en el servidor se llama OPENCLAW_WEBHOOK_SECRET. No lo imprimas.

La skill no usa la herramienta HTTP. Esa herramienta manda x-openclaw-secret vacío. La entrega es un curl para que el shell expanda las variables.

Cuando llegue una foto, un PDF o un texto de cobro:

1. Escribe invoice.json con este cuerpo. Si no hay archivo, omite media, mime y filename. El archivo no puede pasar de 4 MB. El secreto no va en el JSON.

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

2. Si BLINKA_WEBHOOK_SECRET está vacío, no llames y di que falta la variable en el entorno del servicio.
3. Ejecuta este comando tal cual. No sustituyas $BLINKA_WEBHOOK_URL ni $BLINKA_WEBHOOK_SECRET por su valor.

curl -sS -X POST "$BLINKA_WEBHOOK_URL" -H "content-type: application/json" -H "x-openclaw-secret: $BLINKA_WEBHOOK_SECRET" --data-binary @invoice.json

No apruebes, no rechaces y no calcules montos. Si el webhook responde 200, contesta solo que quedó recibido y, si viene invoice.id, inclúyelo. Si falla, di que no se pudo entregar.

Al terminar, responde únicamente con el nombre de la skill y confirma que el header lo expande el shell. No muestres el secreto.
