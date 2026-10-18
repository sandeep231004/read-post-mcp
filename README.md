# read-post-mcp

Give your AI agent a link to a social media post, and it gets back what the post says: the text, who posted it, when, the counts, the links, the photos, and frames from the video.

No logins, no API keys, no accounts.

## Why

Agents reach the web as logged-out visitors, and most social sites show logged-out visitors a login wall. Ask an agent to read a tweet or an Instagram reel and it usually comes back with "I can't access this."

But every one of these sites *wants* its posts shown on other websites, so each one keeps a public door open for embedding: the "embed this post" widget, an oEmbed endpoint, or a public API. Those doors don't need a login.

`read-post-mcp` walks through those doors and nothing else. It never logs in, never uses cookies, and never pretends to be a browser. If a site won't show a post publicly, the tool says so and stops.

## What it looks like

The agent calls one tool:

```
read_post({ url: "https://x.com/vercel/status/1683920951807971329" })
```

and gets back:

```json
{
  "site": "x.com",
  "url": "https://x.com/vercel/status/1683920951807971329",
  "author": { "name": "Vercel", "handle": "vercel" },
  "date": "2023-07-25T19:23:35.000Z",
  "text": "Introducing `react-tweet`:\n\n◆ 35x less client-side JavaScript than the Twitter <iframe>\n◆ React Server Components for built-in data fetching\n◆ Works with Next.js, Vite, CRA, and more\n\nhttps://vercel.com/blog/introducing-react-tweet",
  "stats": { "likes": 1702, "replies": 67 },
  "links": ["https://vercel.com/blog/introducing-react-tweet"],
  "photos": [],
  "videos": [],
  "card": {
    "url": "https://vercel.com/blog/introducing-react-tweet",
    "title": "Introducing React Tweet",
    "description": "Embed tweets into your React application without sacrificing performance."
  }
}
```

Photos come back as real images the agent can look at, not just links. For videos, pass `frames: true` and the agent gets 10 evenly spaced frames, so it can read on-screen text and code and follow what happens.

## Supported sites

| Site | Links it understands | What you get | Where it reads from |
|---|---|---|---|
| X / Twitter | `x.com/<user>/status/<id>`, `twitter.com/...` | text, author, date, likes, replies, links, photos, video, alt text, link preview, quoted post | X's embed widget data |
| Instagram | `/p/<code>`, `/reel/<code>`, `/reels/<code>`, `/tv/<code>` | caption, author, date, comment count, photos, video, alt text, audio credit | the post's embed page |
| Threads | `threads.com/@<user>/post/<code>` (`.net` too) | text, links, date, likes, replies, reposts, shares | the post's embed page |
| Facebook | `/<page>/posts/<id>`, `/videos/`, `permalink.php`, `/photo`, `/share/` | text, author, date, comments, shares, photos | Facebook's embedded-post plugin |
| LinkedIn | `/posts/...-activity-<id>-...`, `/feed/update/urn:li:...` | text, author, date, reactions, comments, links, photo | the post's embed page |
| Bluesky | `bsky.app/profile/<handle>/post/<id>` | text, date, likes, reposts, replies, quotes, links, photos, video, alt text, link preview, quoted post | Bluesky's public API |
| Mastodon | `<any server>/@<user>/<id>` | text, content warning, date, likes, boosts, replies, links, photos, video, alt text, link preview, quoted post, poll | that server's public API |
| YouTube | `watch?v=`, `youtu.be/`, `/shorts/`, `/live/` | title, description, channel, date, views, length, thumbnail, category, tags | the public watch page |
| Vimeo | `vimeo.com/<id>`, `player.vimeo.com/video/<id>` | title, description, author, upload day, length, thumbnail | Vimeo's oEmbed API |
| Tumblr | `<blog>.tumblr.com/post/<id>`, `tumblr.com/<blog>/<id>` | text, tags, date, notes, images | Tumblr's public read API |
| Pinterest | `pinterest.<any country>/pin/<id>` | description, creator, saves, image, board | Pinterest's widget API |
| Reddit | `/r/<sub>/comments/<id>`, `redd.it/<id>` | title, body, flair, author, date, score, comment count, link, images, galleries, video | the [Arctic Shift](https://arctic-shift.photon-reddit.com) archive, checked against Reddit (see below) |

**About Reddit.** Reddit blocks its own data (JSON, RSS, embeds) without a login. So the post is read from Arctic Shift, a public research archive of Reddit, and returned only if Reddit's own oEmbed still shows the post publicly. A post its author deleted stays deleted here. Scores and comment counts are snapshots from when the archive saved the post, and the result's `note` says so.

## Install

You need [Node.js](https://nodejs.org) 18 or newer (tested on 22). For video frames you also need [ffmpeg](https://ffmpeg.org); everything else works without it.

```bash
git clone https://github.com/sandeep231004/read-post-mcp.git
```

```bash
cd read-post-mcp && npm install && npm run build
```

Then point your agent at `dist/index.js`.

**Claude Code:**

```bash
claude mcp add read-post -- node /absolute/path/to/read-post-mcp/dist/index.js
```

**Other MCP clients** (Claude Desktop, Cursor, and others) take the same server in their JSON config:

```json
{
  "mcpServers": {
    "read-post": {
      "command": "node",
      "args": ["/absolute/path/to/read-post-mcp/dist/index.js"]
    }
  }
}
```

It has been tested with Claude Code. Start a new session after adding it so the tool shows up.

## The tool

### `read_post`

| Input | Type | What it does |
|---|---|---|
| `url` | string | Link to the post |
| `frames` | boolean, optional | Also return 10 frames from each video as images. Needs ffmpeg. YouTube and Vimeo lock their video files, so there are no frames there. |

The answer comes back as:

1. A text block with the post as JSON (fields below).
2. The post's photos, as images.
3. For each video: its thumbnail, or with `frames: true`, 10 frames each labelled with its time ("Video frame at 2.8s").
4. The quoted post's photos, if it quotes a post that has any.

If the post can't be read publicly, the tool returns an error such as *"Instagram post ABC isn't publicly available (removed, private, or age-restricted). read-post-mcp only reads public posts and never logs in."* A link from a site it doesn't support yet gets an error listing the sites it does.

### Post fields

| Field | Always there | What it holds |
|---|---|---|
| `site` | yes | The site, e.g. `x.com`, or the Mastodon server |
| `url` | yes | Clean link to the post |
| `author` | yes | `name` and `handle` |
| `date` | when the site gives one | ISO 8601 in UTC. Vimeo gives the day only, because its time has no timezone. |
| `text` | yes | The post's text, with the site's short links expanded |
| `stats` | yes | Counts the site shows publicly, e.g. `likes`, `replies`, `views` |
| `links` | yes | Every link in the post, including ones written in the text |
| `photos` | yes | Image URLs (also sent as images) |
| `videos` | yes | `url`, `poster`, and `durationMs` when known |
| `alts` | no | The author's descriptions of the attached photos and videos |
| `card` | no | The link preview: `url`, `title`, `description` |
| `replyingTo` | no | Who the post replies to (X) |
| `quoted` | no | The quoted post, with the same fields |
| `note` | no | Extra details (audio credit, board, tags, poll) and caveats (where the data came from) |

## What it can't do

- **TikTok** isn't supported yet. It couldn't be tested from the network this was built on.
- **Comments and replies** aren't read on any site, only the post itself.
- **YouTube captions** exist, but YouTube serves them empty without a login token, so you get the title and description, not the spoken words.
- **No video frames for YouTube or Vimeo**, whose video files are locked. You get the thumbnail.
- **No audio transcripts** for any video, only frames.
- **Likes on Facebook and Instagram** are left out, because their embeds show numbers that don't match the real count.
- **Not tested with real examples yet:** Threads posts with photos or video, Pinterest video pins, and Instagram carousels. The code handles them, but expect rough edges.
- **These doors can move.** Bluesky, Mastodon, and the oEmbed endpoints are official. The embed pages and widget data are public but undocumented, so a site can change them without notice. When one breaks, it's usually a small fix in that site's file.

## Ground rules

- Public posts only. No logins, cookies, accounts, or API keys.
- If a site shows a login wall, the tool reports it and stops. It doesn't try to get around it.
- No browser impersonation: requests go out as plain Node.js requests.
- It runs on your machine, so each person's traffic comes from their own computer, at their own pace.
- Each post is fetched once per session and then remembered, so asking again doesn't hit the site again.

## Development

```bash
npm run check
```

This builds the project and runs [`src/check.ts`](src/check.ts): link-matching checks, plus a live read of a real public post on every site. It needs the internet, and a failure can also mean a test post was deleted or changed.

**Layout:**

- [`src/index.ts`](src/index.ts) is the MCP server: the `read_post` tool, the list of sites, images, and video frames.
- [`src/post.ts`](src/post.ts) is the `Post` shape every site returns, plus small shared helpers.
- [`src/sites/`](src/sites) has one file per site. Each file answers two questions: "is this link mine, and what's the post id?" and "given the id, what does the post say?"

**Adding a site:**

1. Find the site's public door: an oEmbed endpoint, an embed page, or a public API that answers without a login.
2. Add `src/sites/<site>.ts` exporting a matcher (`url → id`) and a reader (`id → Post`). Throw `notPublic(...)` when the post isn't public.
3. Add it to the `SITES` list in `src/index.ts`. Keep Mastodon last, because it matches any server's links.
4. Add a link check and a live read to `src/check.ts`, then test it through the MCP server with real posts.

## License

MIT
