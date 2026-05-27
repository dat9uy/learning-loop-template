export function validateFilenameConventions(records) {
  const warnings = [];

  for (const record of records) {
    const filePath = record.__file || "";
    const basename = filePath.split("/").pop() || "";

    // Only check event-like artifact types
    if (!["decision", "experiment", "risk"].includes(record.type)) continue;

    // Short-year compact format YYMMDDTmmZ (e.g. 260512T1310Z)
    const shortYearPattern = /\d{6}T\d{4}Z/;

    // Full-year datetime format YYYYMMDDThhmmssZ (e.g. 20260512T131045Z)
    const fullYearDateTimePattern = /20\d{6}T\d{6}Z/;

    // Full-year date-only format YYYYMMDD (e.g. 20260512)
    const fullYearDatePattern = /20\d{8}/;

    // Already correct: short-year compact format present
    if (shortYearPattern.test(basename)) {
      continue;
    }

    // Deprecated: full-year datetime format
    if (fullYearDateTimePattern.test(basename)) {
      warnings.push(
        `${filePath}: uses deprecated full-year timestamp format; use YYMMDDTmmZ`,
      );
      continue;
    }

    // Deprecated: full-year date-only format
    if (fullYearDatePattern.test(basename)) {
      warnings.push(
        `${filePath}: uses deprecated full-year date-only format; use YYMMDDTmmZ`,
      );
      continue;
    }

    // No recognizable timestamp pattern
    warnings.push(
      `${filePath}: missing timestamp; event-like artifacts should use YYMMDDTmmZ`,
    );
  }

  return warnings;
}
