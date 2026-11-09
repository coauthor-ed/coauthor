// Measure-not-guess, per beat: sizes a DomSimulation's design rectangle to the
// content that is visible right now, so a short beat is not padded out to the
// tallest one. Call it from _render() and from a _reconcileOrientation override
// (the design width changes with orientation). `scene` is the DomSimulation.
export function fitToContent(scene) {
  if (!scene.root || !scene._scaleWrap) return;
  scene.root.style.height = 'auto';
  const height = Math.ceil(scene.root.offsetHeight);
  if (!height) return;
  scene._designH = height;
  scene._scaleWrap.style.aspectRatio = `${scene._designW} / ${height}`;
}
