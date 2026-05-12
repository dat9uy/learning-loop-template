import { parse as parseYaml } from "yaml";

export class RecordParseError extends Error {
  constructor({ kind, file, cause }) {
    super(`${file}: ${kind}`);
    this.name = "RecordParseError";
    this.kind = kind;
    this.file = file;
    this.cause = cause;
  }
}

export function parseRecordYaml(text, file) {
  try {
    return parseYaml(text);
  } catch (cause) {
    throw new RecordParseError({ kind: "yaml-syntax", file, cause });
  }
}
