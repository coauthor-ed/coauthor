/**
 * Backwards-compatibility re-export shim.
 *
 * SimulationBase has been moved to src/simulations/base/SimulationBase.js
 * as part of the simulation library architecture refactor.
 *
 * Any existing imports from this path continue to work unchanged.
 * New code should import directly from the canonical location:
 *
 *   import { SimulationBase } from '../../simulations/base/SimulationBase.js';
 */
export { SimulationBase } from '../../simulations/base/SimulationBase.js';
