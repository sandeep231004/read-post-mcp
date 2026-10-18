import { htmlToText, notPublic, type Post } from "../post.js";

// pinterest.<any country domain>/pin/<id>
export function pinterestId(url: string): string | undefined {
  const u = new URL(url);
  if (!/(^|\.)pinterest\.[a-z.]+$/.test(u.hostname)) return undefined;
  return u.pathname.match(/^\/pin\/(\d+)/)?.[1];
}

// Pinterest's widget API (used by its embed buttons) answers without a login.
export async function readPinterest(id: string): Promise<Post> {
  const res = await fetch(`https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${id}`);
  const p = res.ok ? (await res.json()).data?.[0] : undefined;
  if (!p?.images) throw notPublic(`Pinterest pin ${id}`);

  const creator = p.native_creator ?? p.pinner;
  const video = Object.values(p.videos?.video_list ?? {}).find((v: any) => v.url?.endsWith(".mp4")) as any;
  return {
    site: "pinterest.com",
    url: `https://www.pinterest.com/pin/${id}/`,
    author: { name: creator?.full_name ?? "", handle: creator?.profile_url?.split("/").filter(Boolean).pop() ?? "" },
    text: htmlToText([p.title, p.description].filter(Boolean).join("\n\n")),
    stats: { saves: p.aggregated_pin_data?.aggregated_stats?.saves ?? 0 },
    note: p.board?.name ? `Saved to board "${p.board.name}"` : undefined,
    links: p.link ? [p.link] : [],
    photos: [p.images["564x"]?.url ?? Object.values<any>(p.images).at(-1).url],
    // ponytail: video pins untested (none found yet); picks the first mp4 in video_list.
    videos: video ? [{ url: video.url, poster: video.thumbnail, durationMs: video.duration }] : [],
  };
}
