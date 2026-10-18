#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NotPublicError, type Post } from "./post.js";
import { blueskyId, readBluesky } from "./sites/bluesky.js";
import { facebookId, readFacebook } from "./sites/facebook.js";
import { instagramCode, readInstagram } from "./sites/instagram.js";
import { linkedinId, readLinkedin } from "./sites/linkedin.js";
import { mastodonId, readMastodon } from "./sites/mastodon.js";
import { pinterestId, readPinterest } from "./sites/pinterest.js";
import { readReddit, redditId } from "./sites/reddit.js";
import { readThreads, threadsId } from "./sites/threads.js";
import { readTumblr, tumblrId } from "./sites/tumblr.js";
import { readTweet, tweetId } from "./sites/twitter.js";
import { readVimeo, vimeoId } from "./sites/vimeo.js";
import { readYoutube, youtubeId } from "./sites/youtube.js";

// Each site: how to spot its links, and how to read a post from the id found in the link.
// Mastodon is last because it matches any server's /@user/<id> links.
const SITES: { name: string; match: (url: string) => string | undefined; read: (id: string) => Promise<Post> }[] = [
  { name: "x.com / twitter.com", match: tweetId, read: readTweet },
  { name: "instagram.com", match: instagramCode, read: readInstagram },
  { name: "threads.com", match: threadsId, read: readThreads },
  { name: "facebook.com", match: facebookId, read: readFacebook },
  { name: "linkedin.com", match: linkedinId, read: readLinkedin },
  { name: "bsky.app", match: blueskyId, read: readBluesky },
  { name: "youtube.com", match: youtubeId, read: readYoutube },
  { name: "vimeo.com", match: vimeoId, read: readVimeo },
  { name: "tumblr.com", match: tumblrId, read: readTumblr },
  { name: "pinterest.com", match: pinterestId, read: readPinterest },
  { name: "reddit.com", match: redditId, read: readReddit },
  { name: "Mastodon servers", match: mastodonId, read: readMastodon },
];
const SUPPORTED = SITES.map((s) => s.name).join(", ");

const run = promisify(execFile);
const FRAMES = 10;

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

// ponytail: in-memory cache for the server's lifetime, no eviction; add an LRU if people run it for days.
const cache = new Map<string, Post>();

async function cached(key: string, load: () => Promise<Post>): Promise<Post> {
  if (!cache.has(key)) cache.set(key, await load());
  return cache.get(key)!;
}

// Pick the site file from the link. Unknown sites return undefined.
async function read(url: string): Promise<Post | undefined> {
  for (const site of SITES) {
    const id = site.match(url);
    if (id) return cached(`${site.name}:${id}`, () => site.read(id).then(withTextLinks));
  }
}

// Links written out in the text count as links too, whatever the site put in its own field.
function withTextLinks(post: Post): Post {
  const inText = post.text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  post.links = [...new Set([...post.links, ...inText.map((u) => u.replace(/[.,;:!?]+$/, ""))])];
  return post;
}

async function image(url: string): Promise<Content> {
  const res = await fetch(url);
  if (!res.ok) return { type: "text", text: `(couldn't load image ${url})` };
  return {
    type: "image",
    data: Buffer.from(await res.arrayBuffer()).toString("base64"),
    mimeType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

// When a site doesn't say how long its video is, ask ffprobe (ships with ffmpeg).
async function probeMs(url: string): Promise<number | undefined> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url], { timeout: 30_000 });
    return Number(stdout) * 1000 || undefined;
  } catch {
    return undefined;
  }
}

// A video is a stack of pictures: pull FRAMES of them, evenly spaced, so the agent can look at each.
async function frames(video: Post["videos"][number]): Promise<Content[]> {
  // Only hand ffmpeg plain https links; its other protocols (file:, concat:) could read local files.
  if (new URL(video.url).protocol !== "https:") return [{ type: "text", text: "(skipped video: not an https link)" }];
  const seconds = (video.durationMs ?? (await probeMs(video.url)) ?? 30_000) / 1000;
  const dir = await mkdtemp(join(tmpdir(), "read-post-"));
  try {
    await run(
      "ffmpeg",
      ["-v", "error", "-i", video.url, "-vf", `fps=${(FRAMES / seconds).toFixed(4)},scale='min(1280,iw)':-2`,
        "-frames:v", String(FRAMES), "-q:v", "4", join(dir, "%02d.jpg")],
      { timeout: 120_000 },
    );
    const out: Content[] = [];
    for (const [i, f] of (await readdir(dir)).sort().entries()) {
      out.push({ type: "text", text: `Video frame at ${((i * seconds) / FRAMES).toFixed(1)}s` });
      out.push({ type: "image", data: (await readFile(join(dir, f))).toString("base64"), mimeType: "image/jpeg" });
    }
    return out;
  } catch (e: any) {
    return [{
      type: "text",
      text: e.code === "ENOENT"
        ? "(ffmpeg isn't installed, so no video frames. Install ffmpeg to enable them.)"
        : `(couldn't extract video frames: ${e.message})`,
    }];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const server = new McpServer({ name: "read-post-mcp", version: "0.1.0" });

server.registerTool(
  "read_post",
  {
    description:
      "Read a public social media post from its link: text, author, date, stats, links, photos (as images) and video. " +
      "Uses the site's public embed data and never logs in, so private or protected posts can't be read. " +
      `Supported: ${SUPPORTED}.`,
    inputSchema: {
      url: z.string().url().describe("Link to the post"),
      frames: z.boolean().optional().describe(`Also return ${FRAMES} frames from each video as images (needs ffmpeg; YouTube and Vimeo lock their video files, so no frames there)`),
    },
  },
  async ({ url, frames: wantFrames }) => {
    let post: Post | undefined;
    try {
      post = await read(url);
    } catch (e) {
      const text = e instanceof NotPublicError ? e.message : `Couldn't read ${url}: ${(e as Error).message}`;
      return { isError: true, content: [{ type: "text", text }] };
    }
    if (!post) {
      const text = `Site not supported yet: ${new URL(url).hostname}. Supported: ${SUPPORTED}.`;
      return { isError: true, content: [{ type: "text", text }] };
    }

    const content: Content[] = [{ type: "text", text: JSON.stringify(post, null, 2) }];
    for (const p of post.photos) content.push(await image(p));
    for (const v of post.videos) content.push(...(wantFrames ? await frames(v) : [await image(v.poster)]));
    if (post.quoted?.photos.length) {
      content.push({ type: "text", text: `Photos from the quoted post by ${post.quoted.author.handle}:` });
      for (const p of post.quoted.photos) content.push(await image(p));
    }
    return { content };
  },
);

await server.connect(new StdioServerTransport());
