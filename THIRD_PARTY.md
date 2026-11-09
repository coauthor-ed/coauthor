# Third-party notices

Parts of the simulation kit (src/simulations/base/kit/) and of the scene
review tools (content-repo-template/tools/sim-test/) are adapted from
the MIT-licensed projects below. Each adapted file names its sources in
its header. Fonts, stroke-order data and author art from
huashu-art-motion are NOT used.

| Project | Commit | Used in |
|---|---|---|
| https://github.com/cth9191/animate | 7e5eb56 | SimAnim.js, SimCamera.js, SimDrawOn.js, SimFocus.js, SimFocusSvg.js, SimMorph.js, SimMorphSpec.js, SimMorphSvg.js, SimStage.js, SimStageSpec.js, SimStageSvg.js; tools: motion-probe.mjs |
| https://github.com/alchaincyf/huashu-art-motion | 64cb272 | SimAnim.js, SimCamera.js, SimDrawOn.js, SimFocus.js, SimFocusSvg.js, SimMorph.js, SimMorphSpec.js, SimMorphSvg.js, SimPlot.js, SimPlotSvg.js, SimIso.js, SimIsoSpec.js, SimRig.js, SimRigSvg.js, SimStage.js, SimStageSpec.js, SimStageSvg.js; tools: motion-probe.mjs (thresholds), contrast-lint.mjs |
| https://github.com/wheresryan22/anatomy | e6600ff | SimAnim.js, SimFocus.js, SimFocusSvg.js, SimIso.js, SimIsoSpec.js, SimIsoSvg.js, SimStage.js, SimStageSpec.js, SimStageSvg.js, SimTour.js; tools: motion-probe.mjs, line-ends.mjs |

Copyright notices, kept exactly as published (the second contains the
author's name in Chinese and is the one non-ASCII line, kept on purpose):

    Copyright (c) 2026 cth9191
    Copyright (c) 2026 alchaincyf (花叔 · 花生)
    Copyright (c) 2026 Ryan

All three projects use the same MIT terms:

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

## Fonts (SIL Open Font License 1.1)

Vendored under vendor/fonts/, each folder with its own OFL.txt. Used by
the plain look (src/looks/plain/look.css, vendor/fonts/plain-fonts.css).
Not modified, not renamed.

| Font | Copyright | Folder |
|---|---|---|
| Antic Didone | Copyright (c) 2011, Santiago Orozco, Reserved Font Name "Antic Didone" | vendor/fonts/antic-didone/ |
| Instrument Sans | Copyright 2022 The Instrument Sans Project Authors | vendor/fonts/instrument-sans/ |
| Source Serif 4 | Adobe, OFL 1.1 | vendor/fonts/source-serif-4/ |
| Source Sans 3 | Adobe, OFL 1.1 | vendor/fonts/source-sans-3/ |

## Vendored libraries (vendor/)

Each entry was checked against the file header, a LICENSE file, npm
metadata or the upstream repository. "Not verified" means the licence
or copyright line could not be confirmed from evidence and must be
checked before release. Libraries are listed by the vendor/ path.

| Library | Version | Licence | Project | Copyright / notice | Vendored file |
|---|---|---|---|---|---|
| Lit | 3.2.0 | BSD-3-Clause | https://github.com/lit/lit | Copyright 2017, 2019, 2022 Google LLC | vendor/lit.js |
| idb | 8.0.0 | ISC | https://github.com/jakearchibald/idb | Copyright (c) 2016, Jake Archibald | vendor/idb.js |
| D3 (d3 bundle) | 7.9.0 | ISC | https://d3js.org / https://github.com/d3/d3 | Copyright 2010-2026 Mike Bostock (upstream LICENSE) | vendor/d3.js |
| mathjs (number build) | 13.2.0 | Apache-2.0 | https://mathjs.org / https://github.com/josdejong/mathjs | Project by Jos de Jong; the LICENSE text has no copyright line | vendor/mathjs.js |
| MathLive | 0.109.1 | MIT | https://github.com/arnog/mathlive | Author Arno Gourdol (npm metadata); copyright line not verified | vendor/mathlive.js |
| Matter.js (matter-js) | 0.19.0 | MIT | https://github.com/liabru/matter-js | Copyright (c) Liam Brummitt and contributors | vendor/matter.js |
| topojson-client | 3.1.0 | ISC | https://github.com/topojson/topojson-client | Copyright 2012-2019 Michael Bostock | vendor/topojson-client.js |
| CodeMirror (markdown bundle) | not recorded | MIT | https://codemirror.net | Copyright (C) 2018 by Marijn Haverbeke and others | vendor/codemirror-md.js |
| Compute Engine (cortex-js) | 0.26.2 | MIT | https://github.com/cortex-js/compute-engine | Copyright (c) 2019 CortexJS | vendor/compute-engine.js |
| canvas-confetti | 1.9.3 | ISC | https://github.com/catdad/canvas-confetti | Copyright (c) 2020, Kiril Vatev | vendor/confetti/confetti.module.mjs |
| transformers.js (@huggingface/transformers) | 3.5.1 | Apache-2.0 | https://github.com/huggingface/transformers.js | Licence text is the template only; copyright holder not verified (project by Hugging Face) | vendor/transformers/transformers.web.js |
| ONNX Runtime Web (wasm bundle) | 1.22.0-dev.20250409-89f8206ba4 | MIT | https://github.com/microsoft/onnxruntime | Copyright (c) Microsoft Corporation | vendor/transformers/ort/ |
| marked | 18.0.6 | MIT | https://github.com/markedjs/marked | Copyright (c) 2018-2026 MarkedJS; Copyright (c) 2011-2018 Christopher Jeffrey | vendor/marked.esm.js |
| DOMPurify | 3.1.6 | Apache-2.0 and MPL-2.0 (file header: "Released under the Apache license 2.0 and Mozilla Public License 2.0") | https://github.com/cure53/DOMPurify | Copyright Cure53 and other contributors | vendor/dompurify.js |
| pdf.js (pdfjs-dist) | not recorded | Apache-2.0 | https://github.com/mozilla/pdf.js | Copyright 2023 Mozilla Foundation | vendor/pdfjs/ |
| three.js | 0.185.1 | MIT | https://threejs.org | Copyright 2010-2026 Three.js Authors | vendor/three/ |
| world-atlas | 2 | ISC | https://github.com/topojson/world-atlas | Copyright 2013-2019 Michael Bostock (upstream LICENSE); data derived from Natural Earth (public domain) | vendor/world-atlas/ |
| KaTeX (fonts only) | not recorded | SIL OFL 1.1 for the font files (embedded licence in the upstream KaTeX_*.ttf files, checked at https://github.com/KaTeX/KaTeX/tree/main/fonts); upstream KaTeX code is MIT (Copyright (c) 2013-2020 Khan Academy and other contributors, https://github.com/KaTeX/KaTeX/blob/main/LICENSE) | https://katex.org | Fonts: Copyright (c) 2014-2018 Khan Academy (www.khanacademy.org), with Reserved Font Names KaTeX_Main, KaTeX_AMS etc.; derived from MathJax fonts, Copyright (c) 2009-2010 Design Science, Inc. (www.mathjax.org). The font build scripts (KaTeX/katex-fonts) are MIT, Copyright (c) 2018 Khan Academy. | vendor/fonts/KaTeX_*.woff2 |

Notes on the table:

- Only the KaTeX font files are vendored. The KaTeX code is not part of
  this repository. The fonts are credited above.
- compute-engine.js bundles Complex.js v2.1.1 (Copyright (c) 2020, Robert
  Eisele; "Dual licensed under the MIT or GPL Version 2 licenses") and
  decimal.js v10.4.3 (MIT, Copyright (c) 2022 Michael Mclaughlin).
  This project uses the MIT option of Complex.js.
- mathjs.js bundles decimal.js v10.6.0 (MIT, Copyright (c) 2025 Michael Mclaughlin).
- Libraries whose version is "not recorded" carry no version string
  in the vendored file. Record the version when the file is next re-vendored.
- The three.js addon files (vendor/three/examples/jsm/) carry no header.
  They come from the same three.js package as the MIT-licensed core.

### Model

| Item | Version | Licence | Source | Notice |
|---|---|---|---|---|
| all-MiniLM-L6-v2 (q8 ONNX conversion, vendor/models/all-minilm-l6-v2/) | not recorded | apache-2.0, as declared on the model card of the conversion | https://huggingface.co/Xenova/all-MiniLM-L6-v2 | Converts sentence-transformers/all-MiniLM-L6-v2 (https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2, owner: sentence-transformers). The upstream card (https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) also declares apache-2.0 (verified). The Xenova card lists base model nreimers/MiniLM-L6-H384-uncased. config.json names sentence-transformers/all-MiniLM-L6-v2 as the source. |

## Fonts (additional, SIL Open Font License 1.1)

These are in vendor/fonts/ and are used by the student app and the
story look. Each has the OFL 1.1 terms.

| Font | Copyright | Folder | Licence file |
|---|---|---|---|
| Dela Gothic One | Copyright 2020 The Dela Gothic Project Authors (https://github.com/syakuzen/DelaGothic) | vendor/fonts/dela-gothic-one/ | OFL.txt (present) |
| Manrope | Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope) | vendor/fonts/manrope/ | OFL.txt (present) |
| Nunito | Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito) | vendor/fonts/nunito/ | OFL.txt (present; from https://github.com/googlefonts/nunito/blob/main/OFL.txt) |
| Fredoka | Copyright 2016 The Fredoka Project Authors (https://github.com/hafontia/Fredoka-One) | vendor/fonts/fredoka/ | OFL.txt (present; from https://github.com/google/fonts/blob/main/ofl/fredoka/OFL.txt, the Google Fonts source of the vendored variable woff2) |
| Noto Sans Symbols 2 subset (Nunito-symbols.woff2) | Copyright 2022 The Noto Project Authors (https://github.com/notofonts/symbols) | vendor/fonts/nunito/ (licence text: OFL-NotoSansSymbols2.txt) | SIL OFL 1.1, verified at https://github.com/google/fonts/blob/main/ofl/notosanssymbols2/OFL.txt. Covered by the Nunito OFL.txt folder only as a neighbour; the Noto copyright line above must accompany it. |

The Instrument Sans, Antic Didone, Source Serif 4 and Source Sans 3
entries are in the Fonts section above.

## Map data (vendor/geo/)

Source: vendor/geo/SOURCES.md.

| Layer | File | Source | Licence / terms |
|---|---|---|---|
| india | india-soi.json | Survey of India, "International Boundary of India, vector format" | See the section below. |
| plates | plates.json | P. Bird (2003), PB2002, G-cubed 4(3) 1027, doi:10.1029/2001GC000252; digital files via github.com/fraxen/tectonicplates (H. Ahlenius, Nordpil) | ODC-By 1.0. Credit required: "Plate boundaries: Bird (2003), PB2002; Ahlenius/Nordpil". Not MIT. |
| quakes | quakes.json | USGS ANSS ComCat, M >= 6.0, 2000-2024 | US public domain. |
| volcanoes | volcanoes.json | NOAA NCEI / WDS volcano locations database | US public domain. |
| elevation | elevation-1deg.json | NOAA ETOPO1 ice surface (Amante and Eakins 2009) | US public domain. |
| rivers | rivers.json | Natural Earth 1:50m rivers and lake centrelines | Public domain (Natural Earth states its data is public domain). |

## India boundary data

vendor/geo/india-soi.json is the Survey of India boundary layer. It is not covered by this repository's MIT licence. Its use is limited by the Survey of India terms: no commercial use. Credit: Survey of India.
