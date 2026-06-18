/**
 * Single source of truth for the server version.
 *
 * Read from package.json at runtime rather than imported as a module so the
 * file is not pulled into the TypeScript rootDir (`src`). The relative path
 * resolves to the repo-root package.json identically under ts-node (src/) and
 * the compiled build (dist/), since both directories sit one level under root.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const SERVER_VERSION: string = require('../package.json').version
