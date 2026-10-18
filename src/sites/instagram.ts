import { dateFromMetaCode, NotPublicError, type Post } from "../post.js";

// Matches instagram.com/p/<code>, /reel/<code>, /reels/<code>, /tv/<code>, and /<user>/p/<code>
export function instagramCode(url: string): string | undefined {
  const u = new URL(url);
  if (!/^(www\.|m\.)?instagram\.com$/.test(u.hostname)) return undefined;
  return u.pathname.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/)?.[1];
}

function audioCredit(music: any): string | undefined {
  if (!music) return undefined;
  return music.uses_original_audio ? `Audio: original audio by ${music.artist_name}` : `Audio: ${music.song_name} by ${music.artist_name}`;
}

// Instagram's embed page (meant for other websites) carries the post's data in a "contextJSON" string.
export async function readInstagram(code: string): Promise<Post> {
  const res = await fetch(`https://www.instagram.com/p/${code}/embed/captioned/`);
  const html = res.ok ? await res.text() : "";
  const raw = html.slice(html.indexOf('"contextJSON":')).match(/^"contextJSON":("(?:[^"\\]|\\.)*")/)?.[1];
  const media = raw ? JSON.parse(JSON.parse(raw)).gql_data?.shortcode_media : undefined;
  if (!media) {
    throw new NotPublicError(
      `Instagram post ${code} isn't publicly available (removed, private account, or age-restricted). ` +
        "read-post-mcp only reads public posts and never logs in.",
    );
  }

  // A carousel holds several photos/videos; a single post is just itself.
  const items: any[] = media.edge_sidecar_to_children?.edges.map((e: any) => e.node) ?? [media];
  return {
    site: "instagram.com",
    url: `https://www.instagram.com/p/${media.shortcode}/`,
    author: { name: media.owner.username, handle: media.owner.username },
    date: dateFromMetaCode(media.shortcode),
    // The embed's like count reads 0, so likes are left out.
    text: media.edge_media_to_caption?.edges[0]?.node.text ?? "",
    stats: { comments: media.edge_media_to_comment?.count ?? 0 },
    links: [],
    alts: items.some((m) => m.accessibility_caption) ? items.map((m) => m.accessibility_caption).filter(Boolean) : undefined,
    note: audioCredit(media.clips_music_attribution_info),
    photos: items.filter((m) => !m.is_video).map((m) => m.display_url),
    videos: items
      .filter((m) => m.is_video && m.video_url)
      .map((m) => ({
        url: m.video_url,
        poster: m.display_url,
        durationMs: m.video_duration ? Math.round(m.video_duration * 1000) : undefined,
      })),
  };
}
