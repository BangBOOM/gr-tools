/** JSON with duplicate keys, nonfinite numbers and excessive nesting rejected. */
export function strictJSON(source: string): unknown {
  let at = 0;
  const fail = (): never => { throw new Error(`Malformed or ambiguous JSON at ${at}`); };
  const space = () => { while (/[\x20\t\r\n]/.test(source[at] ?? "!") && at < source.length) at++; };
  const string = (): string => {
    const begin = at++;
    while (at < source.length) {
      const c = source[at++];
      if (c === '"') return JSON.parse(source.slice(begin, at));
      if (c === "\\") at++;
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 100) return fail();
    space();
    const c = source[at];
    if (c === '"') return string();
    if (c === "{") {
      at++; space();
      const out: Record<string, unknown> = Object.create(null);
      if (source[at] === "}") { at++; return out; }
      while (true) {
        space(); if (source[at] !== '"') return fail();
        const key = string();
        if (Object.hasOwn(out, key)) return fail();
        space(); if (source[at++] !== ":") return fail();
        out[key] = value(depth + 1); space();
        const end = source[at++];
        if (end === "}") return out;
        if (end !== ",") return fail();
      }
    }
    if (c === "[") {
      at++; space(); const out: unknown[] = [];
      if (source[at] === "]") { at++; return out; }
      while (true) {
        out.push(value(depth + 1)); space();
        const end = source[at++];
        if (end === "]") return out;
        if (end !== ",") return fail();
      }
    }
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]] as const) {
      if (source.startsWith(literal, at)) { at += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(at));
    if (number) {
      at += number[0].length; const result = Number(number[0]);
      if (!Number.isFinite(result)) return fail();
      return result;
    }
    return fail();
  };
  const result = value(0); space(); if (at !== source.length) return fail();
  return result;
}
