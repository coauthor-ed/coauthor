
Your workspace holds everything: the chapter PDF, notes, logs and drafts. Publishing copies only what a learner needs into a **separate public folder**, which you then host on the web.

## 1. Make the public copy

Create an empty git repository for the public course (for example on GitHub), clone it next to your workspace, then from the workspace run:

```bash
node tools/operator/publish.mjs --to ../my-public-courses
```

This is a dry run: it lists what it would copy. When it looks right, add `--yes`.

What goes in: lessons, slides, questions, tests, banks, media, simulation code, and a generated `manifest.json` for each course.

What never goes in: the chapter source (PDFs are refused outright), your working notes, review notes and logs.

> [!WARNING]
> Check that you have the right to share every image and text in the course. The chapter PDF is never published, but a figure redrawn too closely from a textbook can still be a problem. The kit's `docs/copyright-and-sourcing.md` explains what is safe.

To check the result in the real app before you push, add `--verify`: it serves the public copy and clicks through each approved lesson as a student would.

## 2. Push and host it

Commit and push the public repository yourself. Then turn on free hosting, for example **GitHub Pages** for that repository. The publish step already adds the files Pages needs.

Licences are added for you: course content under CC BY-SA 4.0, so others can adapt it and share it back, and code under MIT.

## 3. Add it to CoAuthor

Each published course has a `manifest.json`. Its web address is what a parent pastes into CoAuthor:

1. **Parent area**, then **Settings**, then **Course sources**.
2. Paste the manifest address, for example `https://<you>.github.io/my-public-courses/grade9/motion/manifest.json`.
3. Read the trust warning and choose **Add it**.

See [Adding a course source](adding-a-course-source) for what parents see.

## Updating

Edit and approve in your workspace, run `publish.mjs` again, then commit and push. Your workspace is always the source of truth; if someone fixes a typo directly in the public repository, `--adopt-public-edits` copies it back.
