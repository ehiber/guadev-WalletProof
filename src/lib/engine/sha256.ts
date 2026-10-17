import { sha256 } from "js-sha256";

export function sha256Hex(value: string): string {
  return sha256(value);
}

export function sha256Bytes(bytes: Uint8Array): string {
  return sha256(bytes);
}
