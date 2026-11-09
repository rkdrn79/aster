# Third-Party Notices

This application is based on Orca by Lovecast Inc., used under the MIT License.
The upstream copyright notice and permission notice are reproduced below as the
license requires.

Bundled runtime components (Electron, Chromium, Node.js and npm packages) remain
under their own licenses. Electron's and Chromium's notices ship beside the app
executable (`LICENSE` and `LICENSES.chromium.html`), and each npm package carries
its license in its own folder.

## Paseo relay

`relay/` is based on the Cloudflare relay adapter in Paseo (`packages/relay`), copyright (c)
2025-present Mohamed Boudra, used under the Apache License, Version 2.0. The full license text is
in `relay/LICENSE`, and `relay/README.md` lists the changes.

## Figure kit assets

The Figure kit in `src/research-harness/vendor/` bundles:

- **MathJax 3.2.2** (`vendor/mathjax/`), copyright The MathJax Consortium, under the Apache
  License, Version 2.0 (full text in `vendor/mathjax/LICENSE`). Only the TeX input and SVG output
  are bundled, by `config/scripts/vendor-figure-mathjax.mjs`.
- **Noto Emoji** images (`vendor/icons/noto/`), copyright Google LLC, under the Apache License,
  Version 2.0 (full text in `vendor/icons/noto/LICENSE`), taken from googlefonts/noto-emoji at
  commit 41e31b1, the last whose images were released under that license.
- **Lucide** icons (`vendor/icons/lucide/`), copyright Lucide Contributors, ISC License, with
  portions copyright Cole Bemis (Feather, MIT License); both texts are in
  `vendor/icons/lucide/LICENSE`.
- **Photographs** from Wikimedia Commons (`vendor/photos/`), each dedicated to the public domain
  under CC0 1.0 by its author; titles, authors and source pages are in
  `vendor/photos/SOURCES.json`.

## Orca

```
MIT License

Copyright (c) 2026 Lovecast Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
