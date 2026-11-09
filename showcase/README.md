# coauthor-showcase

Engine-owned course bundle for the landing page (#/welcome) and the guides
(docs/sprints/completed/landing-page-and-guides.md, "Engine-owned showcase bundle").
It is a normal bundle, so the validators cover it, but it is not offered in
Discover: no course source lists it.

It lives at showcase/ in the app root, not content/courses/. ShowcaseService
registers it at boot, so the logical /content/courses/coauthor-showcase/ paths
and routes still resolve here.

- `blocks/story-preview.json` - the slide shown in Classic and in Story in the
  "Two ways to read" frame (`#/preview/...?look=classic|story`).
- `blocks/arcade-catch.json`, `blocks/arcade-myths.json` - the two arcade games
  on the landing page (docs/sprints/completed/arcade-quill-catch.md).
- `questions/maths-try.json` - the live maths field on the landing page.
- `questions/guide-predict.json`, `lessons/guide-tour.json`,
  `tests/guide-test.json` - a two-slide lesson and a two-question test that
  `tools/guides/shoot.mjs` drives to make the guides' screenshots.
- `glossary.json`, `field-guide.json` - empty on purpose, so a mounted block
  finds them and does not log a 404.

The `coauthor-try` blocks inside guides are mounted with this bundle id too.
