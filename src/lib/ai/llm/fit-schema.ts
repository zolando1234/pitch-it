/*
  Oprava výstupu modelu pred kontrolou schémou: príliš dlhý text sa skráti, nadbytočné položky
  poľa sa vynechajú a čísla sa zaokrúhlia a orežú do povoleného rozsahu. Model často prekročí
  limit o pár znakov a kvôli tomu by sa zahodil celý (inak správny) rozbor. Čistá funkcia.
*/

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  anyOf?: JsonSchema[];
};

export function fitToSchema(value: unknown, schema: JsonSchema | undefined): unknown {
  if (!schema || value === null || value === undefined) return value;
  const variant = schema.anyOf?.find((s) => s.type && s.type !== "null") ?? schema;
  const type = Array.isArray(variant.type) ? variant.type.find((t) => t !== "null") : variant.type;

  if (type === "string" && typeof value === "string") {
    return variant.maxLength !== undefined && value.length > variant.maxLength ? value.slice(0, variant.maxLength) : value;
  }
  if ((type === "integer" || type === "number") && typeof value === "number" && Number.isFinite(value)) {
    let n = type === "integer" ? Math.round(value) : value;
    if (variant.minimum !== undefined) n = Math.max(variant.minimum, n);
    if (variant.maximum !== undefined) n = Math.min(variant.maximum, n);
    return n;
  }
  if (type === "array" && Array.isArray(value)) {
    const items = variant.maxItems !== undefined ? value.slice(0, variant.maxItems) : value;
    return items.map((item) => fitToSchema(item, variant.items));
  }
  if (type === "object" && typeof value === "object" && !Array.isArray(value) && variant.properties) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(variant.properties)) if (key in out) out[key] = fitToSchema(out[key], sub);
    return out;
  }
  return value;
}
