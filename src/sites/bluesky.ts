import { notPublic, type Post } from "../post.js";

// bsky.app/profile/<handle or did>/post/<rkey>
export function blueskyId(url: string): string | undefined {
  const u = new URL(url);
  if (!/^(www\.)?bsky\.app$/.test(u.hostname)) return undefined;
  const m = u.pathname.match(/^\/profile\/([^/]+)\/post\/([a-z0-9]+)/);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

// Bluesky's official public API: no account needed for public posts.
export async function readBluesky(id: string): Promise<Post> {
  const [actor, rkey] = id.split("/");
  const res = await fetch(
    "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=0&parentHeight=0&uri=" +
      encodeURIComponent(`at://${actor}/app.bsky.feed.post/${rkey}`),
  );
  const p = res.ok ? (await res.json()).thread?.post : undefined;
  if (!p) throw notPublic(`Bluesky post ${id}`);

  const stats = { likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0, replies: p.replyCount ?? 0, quotes: p.quoteCount ?? 0 };
  return toPost(p.uri, p.author, p.record, p.embed, stats);
}

// Used for the post itself and for a quoted post, which arrives with the same pieces.
function toPost(uri: string, author: any, record: any, embed: any, stats: Post["stats"]): Post {
  // A post with media and a quote keeps the media under embed.media and the quote under embed.record.record.
  const media = embed?.media ?? embed;
  const type: string = embed?.$type ?? "";
  const quote = type.startsWith("app.bsky.embed.recordWithMedia") ? embed.record?.record
    : type.startsWith("app.bsky.embed.record#") ? embed.record : undefined;
  const ext = media?.external;
  const links: string[] = (record.facets ?? []).flatMap((f: any) => f.features.map((x: any) => x.uri)).filter(Boolean);
  if (ext?.uri) links.push(ext.uri);
  const alts = [...(media?.images ?? []).map((i: any) => i.alt), media?.alt].filter(Boolean);
  return {
    site: "bsky.app",
    url: `https://bsky.app/profile/${author.handle}/post/${uri.split("/").pop()}`,
    author: { name: author.displayName || author.handle, handle: author.handle },
    date: record.createdAt,
    text: record.text,
    stats,
    links,
    photos: (media?.images ?? []).map((i: any) => i.fullsize),
    videos: media?.playlist ? [{ url: media.playlist, poster: media.thumbnail }] : [],
    alts: alts.length ? alts : undefined,
    card: ext?.uri ? { url: ext.uri, title: ext.title, description: ext.description || undefined } : undefined,
    quoted: quote?.value
      ? toPost(quote.uri, quote.author, quote.value, quote.embeds?.[0], {
          likes: quote.likeCount ?? 0, reposts: quote.repostCount ?? 0, replies: quote.replyCount ?? 0, quotes: quote.quoteCount ?? 0,
        })
      : undefined,
  };
}
