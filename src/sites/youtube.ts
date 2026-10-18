import { notPublic, type Post } from "../post.js";

// youtube.com/watch?v=<id>, youtu.be/<id>, youtube.com/shorts/<id>, youtube.com/live/<id>
export function youtubeId(url: string): string | undefined {
  const u = new URL(url);
  if (u.hostname === "youtu.be") return u.pathname.match(/^\/([\w-]{11})/)?.[1];
  if (!/^((www|m)\.)?youtube\.com$/.test(u.hostname)) return undefined;
  return u.searchParams.get("v")?.match(/^[\w-]{11}$/)?.[0] ?? u.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/)?.[1];
}

// The public watch page carries the video's details. The video file itself is encrypted, so no frames.
export async function readYoutube(id: string): Promise<Post> {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`);
  const html = res.ok ? await res.text() : "";
  const json = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|<\/script>)/s)?.[1];
  const player = json ? JSON.parse(json) : undefined;
  const v = player?.videoDetails;
  if (!v || player.playabilityStatus?.status === "LOGIN_REQUIRED") throw notPublic(`YouTube video ${id}`);

  const micro = player.microformat?.playerMicroformatRenderer ?? {};
  return {
    site: "youtube.com",
    url: `https://www.youtube.com/watch?v=${id}`,
    author: { name: v.author, handle: micro.ownerProfileUrl?.split("/").pop()?.replace(/^@/, "") ?? v.channelId },
    date: micro.publishDate ? new Date(micro.publishDate).toISOString() : undefined,
    text: `${v.title}\n\n${v.shortDescription ?? ""}`.trim(),
    stats: { views: Number(v.viewCount ?? 0), seconds: Number(v.lengthSeconds ?? 0) },
    links: [],
    // Captions exist but YouTube serves them empty without a login token, so only these extras are included.
    note: [micro.category && `Category: ${micro.category}`, v.keywords?.length && `Tags: ${v.keywords.join(", ")}`]
      .filter(Boolean).join(". ") || undefined,
    photos: [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`],
    videos: [],
  };
}
