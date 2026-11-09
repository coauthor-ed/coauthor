/**
 * Whether the Quill reactor is running. Quill-look actors that listen for
 * their own cue family (today <quill-math-coach> and the math:* events) stay
 * inert while this is false, so a look without the Quill reactor shows no
 * Quill reactions. Set only by src/looks/quill/reactor.js start() / stop().
 */
export const quillStage = {
  active: false,
  /** When an act last ran through the 20 s budget outside a mascot (<quill-cameo>). */
  lastActAt: 0,
  /** <quill-stagehand> has Quill on screen moving a window. */
  stagehandBusy: false,
};
