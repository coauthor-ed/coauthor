import { ArcadeCatchScene } from 'simulations/base/kit/ArcadeCatchScene.js';
import { FRACTION_FORMS } from './FractionFormsDeck.js';

// The landing page's arcade game: equivalent fractions, ice skin.
export class QuillCatchScene extends ArcadeCatchScene {
  static ARIA_LABEL = "Quill's Catch: a sign shows a fraction; steer Quill under each falling fish that is the same amount, and let the others fall into the sea.";
  static CONFIG = { ...FRACTION_FORMS, title: "Quill's Catch", skin: 'ice', rounds: 18, perTarget: 6 };
}
