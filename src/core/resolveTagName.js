/**
 * Resolves a content type string (e.g., "mcq-single@2") into a valid
 * custom element tag name (e.g., "mcq-single-v2").
 */
export function resolveTagName(type) {
  if (!type || !type.includes('@')) {
    throw new Error(`Invalid plugin type string: "${type}". Expected format "name@version".`);
  }
  const [name, version] = type.split('@');
  return `${name}-v${version}`;
}
