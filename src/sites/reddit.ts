import { htmlToText, notPublic, type Post } from "../post.js";

// reddit.com/r/<sub>/comments/<id>/..., reddit.com/comments/<id>, redd.it/<id>
export function redditId(url: string): string | undefined {
  const u = new URL(url);
  if (u.hostname === "redd.it") return u.pathname.match(/^\/(\w+)/)?.[1];
  if (!/^((www|old|new|m|np)\.)?reddit\.com$/.test(u.hostname)) return undefined;
  return u.pathname.match(/^(?:\/r\/\w+)?\/comments\/(\w+)/)?.[1];
}

// Reddit blocks its own JSON, RSS and embed pages without a login (403), so:
// 1. Read the post from Arctic Shift, a public research archive of Reddit.
// 2. Only return it if Reddit's own oEmbed still shows it publicly. A post its author deleted stays deleted here.
// 3. If the archive doesn't have it yet, fall back to oEmbed's title and author.
export async function readReddit(id: string): Promise<Post> {
  const archived = await fetch(`https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${id}`)
    .then((r) => (r.ok ? r.json() : undefined))
    .then((j) => j?.data?.[0])
    .catch(() => undefined);
  const url = `https://www.reddit.com${archived?.permalink ?? `/comments/${id}/`}`;
  const live = await fetch(`https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : undefined))
    .catch(() => undefined);
  if (!live?.title) throw notPublic(`Reddit post ${id}`);

  if (!archived) {
    return {
      site: "reddit.com", url, author: { name: live.author_name, handle: `u/${live.author_name}` },
      text: live.title, stats: {}, links: [], photos: [], videos: [],
      note: "Title and author only: the post isn't in the public archive yet, and Reddit blocks its body without a login.",
    };
  }

  const p = archived;
  const body = /^\[(removed|deleted)\]$/.test(p.selftext ?? "") ? "" : p.selftext ?? "";
  // Galleries list their images in media_metadata, in the order of gallery_data.
  const gallery = (p.gallery_data?.items ?? [])
    .map((i: any) => p.media_metadata?.[i.media_id]?.s)
    .map((s: any) => s?.u ?? s?.gif)
    .filter(Boolean)
    .map((u: string) => htmlToText(u));
  const image = p.post_hint === "image" ? [p.url] : [];
  const video = p.media?.reddit_video ?? p.secure_media?.reddit_video;
  const preview = p.preview?.images?.[0]?.source?.url && htmlToText(p.preview.images[0].source.url);
  return {
    site: "reddit.com",
    url,
    author: { name: p.author, handle: `u/${p.author}` },
    date: new Date(p.created_utc * 1000).toISOString(),
    text: [p.title, p.link_flair_text && `[${p.link_flair_text}]`, body].filter(Boolean).join("\n\n"),
    stats: { score: p.score ?? 0, comments: p.num_comments ?? 0 },
    links: p.is_self || image.length || gallery.length || video ? [] : [p.url],
    photos: gallery.length ? gallery : image.length ? image : video || !preview ? [] : [preview],
    videos: video?.fallback_url
      ? [{ url: video.fallback_url, poster: preview ?? "", durationMs: video.duration ? video.duration * 1000 : undefined }]
      : [],
    note:
      `r/${p.subreddit}. Read from the Arctic Shift archive (Reddit blocks its own data without a login); ` +
      "score and comment count are from when it was archived" +
      (p.retrieved_on ? ` (${new Date(p.retrieved_on * 1000).toISOString()}).` : "."),
  };
}
