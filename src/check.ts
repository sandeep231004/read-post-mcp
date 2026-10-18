import assert from "node:assert/strict";
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

assert.equal(tweetId("https://x.com/a/status/123?s=20"), "123");
assert.equal(tweetId("https://mobile.twitter.com/a/status/123"), "123");
assert.equal(tweetId("https://x.com/i/web/status/123"), "123");
assert.equal(tweetId("https://evil.com/x.com/a/status/123"), undefined);
assert.equal(tweetId("https://x.com/a"), undefined);

// Live: a public tweet with a link and a video.
const t = await readTweet("2111841517329674419");
assert.equal(t.author.handle, "Nandakishorm1");
assert.match(t.text, /decision model/);
assert.ok(t.links[0].startsWith("https://colab.research.google.com/"));
assert.ok(!t.text.includes("t.co/"));
assert.equal(t.videos.length, 1);
assert.match(t.videos[0].url, /1280x720/);

assert.equal(instagramCode("https://www.instagram.com/reels/Deo4iaohY6z/"), "Deo4iaohY6z");
assert.equal(instagramCode("https://instagram.com/p/Deo4iaohY6z/?igsh=x"), "Deo4iaohY6z");
assert.equal(instagramCode("https://www.instagram.com/someone/p/Deo4iaohY6z/"), "Deo4iaohY6z");
assert.equal(instagramCode("https://www.instagram.com/someone/"), undefined);
assert.equal(instagramCode("https://evil.com/instagram.com/p/abc/"), undefined);

// Live: a public reel.
const ig = await readInstagram("Deo4iaohY6z");
assert.equal(ig.author.handle, "mensetstandards");
assert.match(ig.text, /IShowSpeed/);
assert.equal(ig.videos.length, 1);
assert.equal(ig.videos[0].durationMs, 37100);
assert.ok(ig.videos[0].url.startsWith("https://"));

// Link matching for the other sites (offline).
assert.equal(threadsId("https://www.threads.net/@zuck/post/DOMD1yDj9M4"), "zuck/DOMD1yDj9M4");
assert.equal(facebookId("https://m.facebook.com/zuck/posts/123?ref=x"), "https://www.facebook.com/zuck/posts/123?ref=x");
assert.equal(facebookId("https://www.facebook.com/zuck"), undefined);
assert.equal(linkedinId("https://www.linkedin.com/posts/satyanadella_quantum-activity-7298008744133595140-abcd"), "urn:li:activity:7298008744133595140");
assert.equal(blueskyId("https://bsky.app/profile/bsky.app/post/3mxu3hsnebc2v"), "bsky.app/3mxu3hsnebc2v");
assert.equal(youtubeId("https://www.youtube.com/shorts/jNQXAC9IVRw"), "jNQXAC9IVRw");
assert.equal(youtubeId("https://youtu.be/jNQXAC9IVRw?t=3"), "jNQXAC9IVRw");
assert.equal(vimeoId("https://player.vimeo.com/video/72780372"), "72780372");
assert.equal(tumblrId("https://www.tumblr.com/staff/828009069026721792/premium"), "staff/828009069026721792");
assert.equal(tumblrId("https://staff.tumblr.com/post/828009069026721792"), "staff/828009069026721792");
assert.equal(pinterestId("https://in.pinterest.com/pin/424605071146015538/"), "424605071146015538");
assert.equal(redditId("https://old.reddit.com/r/IAmA/comments/z1c9z/title/"), "z1c9z");
assert.equal(redditId("https://redd.it/z1c9z"), "z1c9z");
assert.equal(mastodonId("https://mastodon.social/@Mastodon/116839714185151652"), "mastodon.social/116839714185151652");
assert.equal(mastodonId("https://medium.com/@someone/a-story-1a2b3c"), undefined);

// Live: one public post per site.
const th = await readThreads("zuck/DOMD1yDj9M4");
assert.match(th.text, /longer text/);
assert.equal(th.date, "2025-09-04T17:18:39.840Z");
assert.ok((th.stats.likes ?? 0) > 1000);
const fb = await readFacebook("https://www.facebook.com/zuck/posts/10104413015393571");
assert.equal(fb.author.name, "Mark Zuckerberg");
assert.ok(fb.text.endsWith("time well spent."));
assert.match(fb.text, /posts from businesses, brands/);
const fq = await readFacebook("https://www.facebook.com/zuck/posts/10102213601037571");
assert.equal(fq.author.name, "Mark Zuckerberg");
assert.equal(fq.stats.comments, 45000);
assert.ok(fq.text.endsWith("in the next hour."));
const li = await readLinkedin("urn:li:share:7298008742661369857");
assert.equal(li.author.name, "Satya Nadella");
assert.equal(li.date, "2025-02-19T16:01:14.696Z");
assert.equal(li.links[0], "https://aka.ms/AAu76rr");
const bs = await readBluesky("bsky.app/3mxyyerrxak2m");
assert.match(bs.videos[0].url, /\.m3u8|video\.bsky\.app/);
const md = await readMastodon("mastodon.social/116839714185151652");
assert.equal(md.videos.length, 1);
const yt = await readYoutube("jNQXAC9IVRw");
assert.equal(yt.author.handle, "jawed");
assert.match(yt.text, /^Me at the zoo/);
assert.ok(yt.date?.endsWith("Z"));
const vm = await readVimeo("72780372");
assert.match(vm.text, /The Break/);
const tb = await readTumblr("staff/828009069026721792");
assert.ok(tb.photos.length > 0);
assert.ok(!tb.text.includes("&rsquo;"));
const pn = await readPinterest("424605071146015538");
assert.equal(pn.photos.length, 1);
const rd = await readReddit("z1c9z");
assert.equal(rd.author.name, "PresidentObama");
assert.match(rd.text, /Ask me anything/);
const rg = await readReddit("1x98ppa");
assert.equal(rg.photos.length, 5);

// Quotes, link cards and alt text.
const xc = await readTweet("1683920951807971329");
assert.equal(xc.card?.title, "Introducing React Tweet");
assert.equal(xc.card?.url, "https://vercel.com/blog/introducing-react-tweet");
const bq = await readBluesky("bsky.app/3my43eyfzs225");
assert.ok(bq.quoted?.text);
assert.ok((bq.quoted?.stats.likes ?? 0) > 0);
const bc = await readBluesky("petridishes.bsky.social/3mxxid5w4kc2p");
assert.match(bc.card?.title ?? "", /Edgar Allan Poe/);
const mq = await readMastodon("mastodon.social/117083694767249113");
assert.ok(mq.quoted?.text);
assert.equal(mq.quoted?.site, "hachyderm.io");
const ma = await readMastodon("mastodon.social/116929144390213579");
assert.match(ma.alts?.[0] ?? "", /Sage/);

console.log("ok");
