export function parseValue(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    return inner ? inner.split(",").map((item) => parseValue(item.trim())) : [];
  }
  return trimmed;
}

function nextMeaningfulLine(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.trim() && !raw.trim().startsWith("#")) return raw;
  }
  return "";
}

function assignValue(parent, key, value) {
  if (Array.isArray(parent)) parent.push({ [key]: value });
  else parent[key] = value;
}

export function parseYaml(text) {
  const rootObject = {};
  const stack = [{ indent: -1, value: rootObject }];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;
    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`List item has non-list parent near: ${trimmed}`);
      const itemText = trimmed.slice(2).trim();
      const keyValueMatch = itemText.match(/^([^:]+):(?:\s+(.*)|\s*)$/);
      if (keyValueMatch && itemText.includes(": ")) {
        const [, key, valueText = ""] = keyValueMatch;
        const item = {};
        item[key.trim()] = valueText ? parseValue(valueText) : {};
        parent.push(item);
        stack.push({ indent, value: item });
        if (!valueText) stack.push({ indent: indent + 1, value: item[key.trim()] });
      } else {
        parent.push(parseValue(itemText));
      }
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator === -1) throw new Error(`Expected key/value near: ${trimmed}`);
    const key = trimmed.slice(0, separator).trim();
    const valueText = trimmed.slice(separator + 1).trim();
    if (valueText) {
      assignValue(parent, key, parseValue(valueText));
      continue;
    }
    const next = nextMeaningfulLine(lines, index + 1).trim();
    const value = next.startsWith("- ") ? [] : {};
    assignValue(parent, key, value);
    stack.push({ indent, value });
  }
  return rootObject;
}
