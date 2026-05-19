import { createHash } from "node:crypto";

export function computeHash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("computeHash expects a Buffer");
  }
  const hex = createHash("sha256").update(buffer).digest("hex");
  return `sha256:${hex}`;
}
