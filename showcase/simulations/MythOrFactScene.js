import { ArcadeJudgeScene } from 'simulations/base/kit/ArcadeJudgeScene.js';
import { SCIENCE_MYTHS } from './ScienceMythsDeck.js';

// The landing page's second arcade game: science myths, cards skin.
export class MythOrFactScene extends ArcadeJudgeScene {
  static ARIA_LABEL = 'Myth or fact? One science statement at a time: swipe or tap TRUE or FALSE; a wrong call shows the evidence.';
  static CONFIG = { ...SCIENCE_MYTHS, title: 'Myth or fact?', skin: 'cards', rounds: 8 };
}
