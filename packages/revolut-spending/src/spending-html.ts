export interface CategorySpend {
  category: string;
  ron: number;
}

const breakdownEvent =
  /\bdata-event-key\s*=\s*(["'])action\.analytics\.transaction-breakdown\.click\1/i;
const breakdownButton = /<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi;
const categoryRow =
  /^(.*?)\s+\d+\s+transactions?\s+[-−]?\s*RON\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s|$)/i;
const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity;
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) =>
      namedEntities[name.toLowerCase()] ?? entity,
    );
}

function visibleText(markup: string): string {
  return decodeHtmlEntities(
    markup.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCategoryBreakdownHtml(input: string): CategorySpend[] {
  const categories: CategorySpend[] = [];
  for (const [, attributes = "", content = ""] of input.matchAll(breakdownButton)) {
    if (!breakdownEvent.test(attributes)) continue;

    const row = categoryRow.exec(visibleText(content));
    const category = row?.[1]?.trim();
    const formattedRon = row?.[2];
    if (!category || !formattedRon) {
      throw new Error("Could not parse a category breakdown row in HTML");
    }

    const ron = Number(formattedRon.replaceAll(",", ""));
    if (!Number.isFinite(ron)) {
      throw new Error("Could not parse a category breakdown row in HTML");
    }
    categories.push({ category, ron });
  }

  if (categories.length === 0) {
    throw new Error("No category breakdown rows found in HTML");
  }
  return categories;
}
