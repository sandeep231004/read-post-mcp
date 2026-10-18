import { dateFromMetaCode, htmlToText, notPublic, parseCount, type Post } from "../post.js";

// threads.com/@<user>/post/<code> (threads.net too)
export function threadsId(url: string): string | undefined {
  const u = new URL(url);
  if (!/^(www\.)?threads\.(com|net)$/.test(u.hostname)) return undefined;
  const m = u.pathname.match(/^\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

// The action bar shows counts next to its icons in Threads' fixed order: like, reply, repost, share.
function counts(html: string): Post["stats"] {
  const names = ["likes", "replies", "reposts", "shares"];
  const out: Post["stats"] = {};
  [...html.matchAll(/class="ActionBarCount">([^<]+)/g)].forEach((m, i) => {
    const n = parseCount(m[1]);
    if (names[i] && n !== undefined) out[names[i]] = n;
  });
  return out;
}

// Threads' embed page (meant for other websites) is plain HTML with the post's text and date.
export async function readThreads(id: string): Promise<Post> {
  const [user, code] = id.split("/");
  const res = await fetch(`https://www.threads.com/@${user}/post/${code}/embed`);
  const html = res.ok ? await res.text() : "";
  const start = html.indexOf('class="BodyTextContainer"');
  if (start < 0) throw notPublic(`Threads post ${id}`);

  const end = html.indexOf('class="PostDateContainer"', start);
  const body = html.slice(html.indexOf(">", start) + 1, end < 0 ? undefined : end);
  return {
    site: "threads.com",
    url: `https://www.threads.com/@${user}/post/${code}`,
    author: { name: user, handle: user },
    date: dateFromMetaCode(code),
    text: htmlToText(body.slice(0, body.search(/<div class="SnippetPreview|$/))),
    stats: counts(html),
    links: [...body.matchAll(/<a href="(https?:[^"]+)"/g)].map((m) => m[1]),
    // ponytail: media parsing untested (no media post found yet); profile pictures live under "-19/" paths.
    photos: [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
      .map((m) => m[1].replace(/&amp;/g, "&"))
      .filter((u) => !/-19\//.test(u)),
    videos: [],
  };
}
