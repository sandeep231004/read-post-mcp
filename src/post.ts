// What every site file returns, so the server can treat all sites the same.
export type Post = {
  site: string;
  url: string;
  author: { name: string; handle: string };
  date?: string;
  text: string;
  stats: Record<string, number>;
  links: string[];
  photos: string[];
  videos: { url: string; poster: string; durationMs?: number }[];
  // Descriptions of the attached photos/videos, written by the author (alt text), in order.
  alts?: string[];
  // The link preview shown under the post.
  card?: { url: string; title: string; description?: string };
  replyingTo?: string;
  quoted?: Post;
  // Extra details (audio credit, board, tags) and caveats (where the data came from, what's missing).
  note?: string;
};

// "3.3K" → 3300, "6.7M" → 6700000, "881" → 881
export function parseCount(s: string | undefined): number | undefined {
  const m = s?.replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return undefined;
  return Math.round(Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k"] ?? 1));
}

// Thrown when a site won't show the post without a login. We stop there, never work around it.
export class NotPublicError extends Error {}

export function notPublic(what: string): NotPublicError {
  return new NotPublicError(
    `${what} isn't publicly available (removed, private, or age-restricted). ` +
      "read-post-mcp only reads public posts and never logs in.",
  );
}

const NAMED: Record<string, string> = {
  quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", bull: "•", copy: "©", reg: "®", trade: "™", laquo: "«", raquo: "»",
};

// Instagram and Threads post codes are base64 ids whose top bits are milliseconds since Instagram's epoch.
export function dateFromMetaCode(code: string): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const id = [...code].reduce((n, ch) => n * 64n + BigInt(A.indexOf(ch)), 0n);
  return new Date(Number(id >> 23n) + 1314220021721).toISOString();
}

// Plain text from a snippet of HTML: line breaks kept, tags dropped, entities decoded.
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name] ?? m)
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}
