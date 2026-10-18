import { notPublic, type Post } from "../post.js";

// vimeo.com/<id>, vimeo.com/channels/<name>/<id>, player.vimeo.com/video/<id>
export function vimeoId(url: string): string | undefined {
  const u = new URL(url);
  if (!/^((www|player)\.)?vimeo\.com$/.test(u.hostname)) return undefined;
  return u.pathname.match(/\/(\d{6,})(?:\/|$)/)?.[1];
}

// Vimeo's public oEmbed API. The video file itself is locked (403), so no frames.
export async function readVimeo(id: string): Promise<Post> {
  const res = await fetch(`https://vimeo.com/api/oembed.json?width=1280&url=https://vimeo.com/${id}`);
  const v = res.ok ? await res.json() : undefined;
  if (!v?.title) throw notPublic(`Vimeo video ${id}`);
  return {
    site: "vimeo.com",
    url: `https://vimeo.com/${id}`,
    author: { name: v.author_name, handle: v.author_url?.split("/").pop() ?? "" },
    // oEmbed gives "2013-08-20 19:46:35" with no timezone, so only the day is certain.
    date: v.upload_date?.slice(0, 10),
    text: `${v.title}\n\n${v.description ?? ""}`.trim(),
    stats: { seconds: v.duration ?? 0 },
    links: [],
    photos: v.thumbnail_url ? [v.thumbnail_url] : [],
    videos: [],
  };
}
