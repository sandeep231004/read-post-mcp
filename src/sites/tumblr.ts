import { htmlToText, notPublic, type Post } from "../post.js";

// <blog>.tumblr.com/post/<id> or tumblr.com/<blog>/<id>
export function tumblrId(url: string): string | undefined {
  const u = new URL(url);
  const sub = u.hostname.match(/^([\w-]+)\.tumblr\.com$/)?.[1];
  if (sub && sub !== "www") {
    const id = u.pathname.match(/^\/post\/(\d+)/)?.[1];
    return id ? `${sub}/${id}` : undefined;
  }
  if (!/^(www\.)?tumblr\.com$/.test(u.hostname)) return undefined;
  const m = u.pathname.match(/^\/([\w-]+)\/(\d+)/);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

// Tumblr's old public read API still answers without a key.
export async function readTumblr(id: string): Promise<Post> {
  const [blog, postId] = id.split("/");
  const res = await fetch(`https://${blog}.tumblr.com/api/read/json?id=${postId}`);
  const js = res.ok ? await res.text() : "";
  const p = js.includes("{") ? JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1)).posts?.[0] : undefined;
  if (!p) throw notPublic(`Tumblr post ${id}`);

  // Each post type keeps its text in different fields; take whichever are present.
  const fields = ["regular-title", "regular-body", "photo-caption", "link-text", "link-description",
    "quote-text", "quote-source", "video-caption", "question", "answer", "conversation-text"];
  const html = fields.map((f) => p[f]).filter(Boolean).join("\n\n");
  const photos = [
    ...(p.photos?.length ? p.photos.map((x: any) => x["photo-url-1280"]) : p["photo-url-1280"] ? [p["photo-url-1280"]] : []),
    ...[...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]),
  ];
  return {
    site: "tumblr.com",
    url: p["url-with-slug"] ?? p.url,
    author: { name: p.tumblelog?.title ?? blog, handle: blog },
    date: new Date(p["unix-timestamp"] * 1000).toISOString(),
    text: [htmlToText(html), (p.tags ?? []).map((t: string) => `#${t}`).join(" ")].filter(Boolean).join("\n\n"),
    stats: { notes: Number(p["note-count"] ?? 0) },
    links: p["link-url"] ? [p["link-url"]] : [],
    photos,
    videos: [],
  };
}
