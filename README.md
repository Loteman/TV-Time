# ZapZap
Watch live Israeli TV channels and radio stations - on a computer, a phone, a tablet and an Android TV.

[https://zapzap.loteman.com/](https://zapzap.loteman.com/)

## How it works
A static site (HTML, CSS and plain JavaScript, no build step) on Cloudflare Pages, deployed from `main`.
It plays only the public streams the broadcasters themselves publish, and hosts no content.

- `index.html` + `tv.js` / `tv.css` - the interface on every device; `?old-ui` keeps the classic view (`script.js` / `style.css`).
- `channels.js` - the channels and stations, with their official stream addresses.
- `about.html`, `privacy.html`, `accessibility.html`, `404.html` - the text pages (`page.css` / `page.js`).
- `robots.txt`, `sitemap.xml`, `_headers` (security and cache headers), `og-image.png` (link previews).

Run it locally with any static server, e.g. `python -m http.server 5500`.

When a CSS or JS file changes, bump its `?v=` number in the pages that load it - Cloudflare keeps those files in browsers for hours.

## License
© Loteman Games. All rights reserved. The code and design may not be copied or reused without permission.
Channel and station names belong to their owners; ZapZap is not affiliated with any broadcaster.

Website By Loteman
