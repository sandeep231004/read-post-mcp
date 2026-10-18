import { NotPublicError, type Post } from "../post.js";

// Matches x.com/<user>/status/<id>, twitter.com/..., mobile.twitter.com/..., x.com/i/web/status/<id>
export function tweetId(url: string): string | undefined {
  const u = new URL(url);
  if (!/^((www|mobile)\.)?(x|twitter)\.com$/.test(u.hostname)) return undefined;
  return u.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
}

// The embed widget's JSON endpoint wants this token, derived from the tweet id.
export function token(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export async function readTweet(id: string): Promise<Post> {
  const res = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token(id)}&lang=en`,
  );
  const body = res.ok ? await res.text() : "";
  const data = body ? JSON.parse(body) : undefined;
  if (!data?.user) {
    throw new NotPublicError(
      `Tweet ${id} isn't publicly available (deleted, protected account, or age-restricted). ` +
        "read-post-mcp only reads public posts and never logs in.",
    );
  }
  return toPost(data);
}

function toPost(t: any): Post {
  let text: string = t.text;
  for (const u of t.entities?.urls ?? []) text = text.replace(u.url, u.expanded_url);
  for (const m of t.entities?.media ?? []) text = text.replace(m.url, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

  const media: any[] = t.mediaDetails ?? [];
  return {
    site: "x.com",
    url: `https://x.com/${t.user.screen_name}/status/${t.id_str}`,
    author: { name: t.user.name, handle: t.user.screen_name },
    date: t.created_at,
    text,
    stats: { likes: t.favorite_count ?? 0, replies: t.conversation_count ?? 0 },
    links: (t.entities?.urls ?? []).map((u: any) => u.expanded_url),
    // name=medium caps photos at ~1200px, plenty for an agent to read them.
    photos: media.filter((m) => m.type === "photo").map((m) => `${m.media_url_https}?name=medium`),
    videos: media
      .filter((m) => m.type === "video" || m.type === "animated_gif")
      .map((m) => ({
        url: pickMp4(m.video_info.variants),
        poster: m.media_url_https,
        durationMs: m.video_info.duration_millis,
      })),
    alts: altsOf(media),
    card: cardOf(t),
    replyingTo: t.in_reply_to_screen_name,
    quoted: t.quoted_tweet ? toPost(t.quoted_tweet) : undefined,
  };
}

function altsOf(media: any[]): string[] | undefined {
  const alts = media.map((m) => m.ext_alt_text).filter(Boolean);
  return alts.length ? alts : undefined;
}

// Link previews keep their fields in binding_values, each as { string_value }.
function cardOf(t: any): Post["card"] {
  const b = t.card?.binding_values;
  if (!b?.title?.string_value) return undefined;
  const short = b.card_url?.string_value ?? t.card.url;
  const url = t.entities?.urls?.find((u: any) => u.url === short)?.expanded_url ?? short;
  return { url, title: b.title.string_value, description: b.description?.string_value };
}

// Highest quality up to ~720p: sharp enough to read on-screen text, small enough to pull quickly.
function pickMp4(variants: any[]): string {
  const mp4s = variants
    .filter((v) => v.content_type === "video/mp4")
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return (mp4s.find((v) => (v.bitrate ?? 0) <= 2_500_000) ?? mp4s.at(-1)).url;
}
