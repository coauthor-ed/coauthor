# CoAuthor

CoAuthor is a free learning app for school and college students. It works in the browser, works offline after the first visit, and needs no server or account.

Open the app: https://coauthor-ed.github.io/coauthor/

## What it is
- Interactive lessons with simulations, and practice questions and tests.
- Made first for CBSE classes 9 to 12 in India. The engine itself is subject-neutral.
- The app (this repo) only draws lessons. The lessons live in separate course repos, written as plain JSON files.

## Courses
Open the menu in the app and choose Discover. The course sets are:
- https://github.com/coauthor-ed/cbse-grade9-science
- https://github.com/coauthor-ed/cbse-grade9-sst
- https://github.com/coauthor-ed/cbse-grade9-maths
- https://github.com/coauthor-ed/college-epidemiology

The Discover list is kept in https://github.com/coauthor-ed/coauthor-catalog

## How it is built
- Plain JavaScript modules and web components. No bundler, no build step, nothing loaded from a CDN.
- Progress is saved on the device only (IndexedDB).
- To run it on your own computer, serve this folder with any static file server.

## Docs
- docs/content-authoring-guide.md: how course content is written
- docs/data-model.md: what the app stores on the device
- docs/published-content-contract.md: the rules a published course must follow

## Licence
- App code: MIT (see LICENSE).
- Course content: CC BY 4.0 (see each course repo).
- Third-party libraries and data keep their own licences (see THIRD_PARTY.md).

## Feedback
Report problems at https://github.com/coauthor-ed/coauthor/issues
