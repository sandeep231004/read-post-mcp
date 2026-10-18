import { htmlToText, notPublic, type Post } from "../post.js";

// linkedin.com/posts/<slug>-activity-<id>-..., /feed/update/urn:li:<type>:<id>, /embed/feed/update/urn:li:<type>:<id>
export function linkedinId(url: string): string | undefined {
  const u = new URL(url);
  if (!/^(www\.)?linkedin\.com$/.test(u.hostname)) return undefined;
  const activity = u.pathname.match(/^\/posts\/.*-activity-(\d+)-/)?.[1];
  if (activity) return `urn:li:activity:${activity}`;
  return u.pathname.match(/\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d+)/)?.[1];
}

// LinkedIn's embed page (meant for other websites) has the full post text without a login.
export async function readLinkedin(urn: string): Promise<Post> {
  const res = await fetch(`https://www.linkedin.com/embed/feed/update/${urn}`);
  const html = res.ok ? await res.text() : "";
  const body = html.match(/<p[^>]*attributed-text[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (body === undefined) throw notPublic(`LinkedIn post ${urn}`);

  // The page title reads "<text>… | <author> | <n> comments".
  const title = htmlToText(html.match(/<title>([^<]*)/)?.[1] ?? "").split(" | ");
  const author = /comments?$/.test(title.at(-1) ?? "") ? title.at(-2) : title.at(-1);
  const count = (re: RegExp) => Number(html.match(re)?.[1].replace(/,/g, "") ?? 0);
  return {
    site: "linkedin.com",
    url: `https://www.linkedin.com/feed/update/${urn}/`,
    // The author's profile link (/in/<handle> or /company/<handle>) gives the handle.
    author: { name: author ?? "", handle: html.match(/linkedin\.com\/(?:in|company)\/([\w-]+)/)?.[1] ?? author ?? "" },
    // LinkedIn ids carry their creation time in the top bits.
    date: new Date(Number(BigInt(urn.split(":").pop()!) >> 22n)).toISOString(),
    text: htmlToText(body),
    stats: { reactions: count(/([\d,]+)\s*Reactions/i), comments: count(/([\d,]+)\s*comments/i) },
    // LinkedIn wraps outside links in its redirector; hand back the real destination.
    links: [...body.matchAll(/href="(https?:[^"]+)"/g)].map((m) => {
      let u = new URL(m[1].replace(/&amp;/g, "&"));
      if (u.pathname === "/redir/redirect" && u.searchParams.get("url")) u = new URL(u.searchParams.get("url")!);
      u.searchParams.delete("trk"); // LinkedIn's tracking tag
      return u.href;
    }),
    photos: [...html.matchAll(/(?:src|data-delayed-url)="(https:\/\/media\.licdn\.com\/[^"]+)"/g)]
      .map((m) => m[1].replace(/&amp;/g, "&"))
      .filter((u) => /feedshare|image-shrink/.test(u)),
    videos: [],
  };
}
