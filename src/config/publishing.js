/**
 * Published URLs: the ONE place that names where the catalog lives.
 * Changing the GitHub org (or moving the catalog) means editing only this
 * file. While PUBLISH_ORG is still the placeholder, the catalog is not
 * fetched and Discover shows its empty state / the DEFAULT_SHOWCASE_SOURCES
 * fallback. Dev override: add ?catalogUrl=<url> to the page location
 * (or to the hash route, e.g. #/discover?catalogUrl=...).
 */
export const PUBLISH_ORG = 'coauthor-ed';

export const CATALOG_URL = `https://${PUBLISH_ORG}.github.io/coauthor-catalog/catalog.json`;

/** True while PUBLISH_ORG has not been set to a real org. */
export const PUBLISH_IS_PLACEHOLDER = PUBLISH_ORG === ['ORG', 'PLACEHOLDER'].join('-'); // split so set-org.mjs leaves this check intact

/**
 * Anonymous add-to-shelf counter. Ships OFF. When enabled, only the bundle
 * id is sent (never a profile id or device id). See CatalogService.countInstall.
 */
export const INSTALL_COUNTER = { enabled: false, endpoint: null };
