import { htmlToText, notPublic, type Post } from "../post.js";

// Any Mastodon server: <host>/@<user>/<numeric id>
export function mastodonId(url: string): string | undefined {
  const u = new URL(url);
  const m = u.protocol === "https:" && u.pathname.match(/^\/@[^/]+\/(\d+)$/);
  return m ? `${u.hostname}/${m[1]}` : undefined;
}

// Every Mastodon server answers its public API for public posts without a login.
export async function readMastodon(id: string): Promise<Post> {
  const [host, statusId] = id.split("/");
  const res = await fetch(`https://${host}/api/v1/statuses/${statusId}`);
  const s = res.ok ? await res.json() : undefined;
  if (!s?.account) throw notPublic(`Mastodon post ${id}`);
  return toPost(s);
}

// Used for the post itself and for a quoted post, which arrives in the same shape and may live on another server.
function toPost(s: any): Post {
  const host = new URL(s.url ?? s.uri).hostname;
  const media: any[] = s.media_attachments ?? [];
  const alts = media.map((m) => m.description).filter(Boolean);
  const poll = s.poll?.options.map((o: any) => `${o.title} (${o.votes_count ?? "?"} votes)`).join(", ");
  return {
    site: host,
    url: s.url,
    author: { name: s.account.display_name || s.account.username, handle: s.account.acct },
    date: s.created_at,
    text: [s.spoiler_text, htmlToText(s.content)].filter(Boolean).join("\n\n"),
    stats: { likes: s.favourites_count ?? 0, boosts: s.reblogs_count ?? 0, replies: s.replies_count ?? 0 },
    // Links in the text, skipping @mentions and #hashtags.
    links: [...s.content.matchAll(/<a href="([^"]+)"(?![^>]*class="[^"]*(?:mention|hashtag))/g)].map((m) => m[1]),
    photos: media.filter((m) => m.type === "image").map((m) => m.url),
    videos: media
      .filter((m) => m.type === "video" || m.type === "gifv")
      .map((m) => ({
        url: m.url,
        poster: m.preview_url,
        durationMs: m.meta?.original?.duration ? Math.round(m.meta.original.duration * 1000) : undefined,
      })),
    alts: alts.length ? alts : undefined,
    card: s.card?.url ? { url: s.card.url, title: s.card.title, description: s.card.description || undefined } : undefined,
    quoted: s.quote?.quoted_status ? toPost(s.quote.quoted_status) : undefined,
    note: poll ? `Poll: ${poll}` : undefined,
  };
}
