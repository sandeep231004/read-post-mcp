import { htmlToText, notPublic, parseCount, type Post } from "../post.js";

// facebook.com/<page>/posts/<id>, /permalink.php?story_fbid=..., /<page>/videos/<id>, /photo?fbid=..., /share/p/...
export function facebookId(url: string): string | undefined {
  const u = new URL(url);
  if (!/^((www|m|web)\.)?facebook\.com$/.test(u.hostname)) return undefined;
  if (!/\/(posts|videos|share)\/|^\/(permalink\.php|photo|story\.php)/.test(u.pathname)) return undefined;
  return `https://www.facebook.com${u.pathname}${u.search}`;
}

// Facebook's embed plugin (meant for other websites) renders public posts without a login.
export async function readFacebook(postUrl: string): Promise<Post> {
  const res = await fetch(`https://www.facebook.com/plugins/post.php?locale=en_US&href=${encodeURIComponent(postUrl)}`);
  const html = (res.ok ? await res.text() : "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  const start = html.indexOf('data-testid="post_message"');
  const utime = html.match(/data-utime="(\d+)"/)?.[1];
  if (start < 0 && !utime) throw notPublic(`Facebook post ${postUrl}`);

  // The message runs until the attachment block or, for posts without one, the counts table.
  const rest = start < 0 ? "" : html.slice(html.indexOf(">", start) + 1);
  const end = rest.search(/<div class="_3x-2"|<table/);
  const body = rest.slice(0, end < 0 ? undefined : end)
    // The fold can split a word ("busine<hide>...</hide>sses"); dropping the hidden "..." and "See more" rejoins it.
    .replace(/<span class="text_exposed_hide">[\s\S]*?<\/span>/g, "");
  // Older and newer embed layouts put the name in different places.
  const author = htmlToText(html.match(/<a title="([^"]+)" class="_5pb8|aria-label="([^"]+)" role="img"/)?.slice(1).find(Boolean) ?? "");
  return {
    site: "facebook.com",
    url: postUrl,
    author: { name: author, handle: new URL(postUrl).pathname.split("/")[1] ?? "" },
    date: utime ? new Date(Number(utime) * 1000).toISOString() : undefined,
    text: htmlToText(body),
    // Comment and share counts sit after their icons. The like count shown in embeds doesn't match the
    // post's real reactions (27 on a post with 45K comments), so it's left out.
    stats: Object.fromEntries(
      (["Comment", "Share"] as const)
        .map((t) => [`${t.toLowerCase()}s`, parseCount(html.match(new RegExp(`title="${t}"[\\s\\S]{0,400}?</i>([^<]+)<`))?.[1])])
        .filter(([, n]) => n !== undefined),
    ),
    links: [],
    // Profile pictures are under t39.30808-1; everything else from the fbcdn image servers is post media.
    photos: [...html.matchAll(/<img[^>]+src="(https:\/\/scontent[^"]+)"/g)]
      .map((m) => m[1].replace(/&amp;/g, "&"))
      .filter((u) => !u.includes("/t39.30808-1/")),
    videos: [],
  };
}
