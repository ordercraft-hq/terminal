// Compile-time application version injected by Vite from package.json
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v0.1.0';
export const REPO_HOMEPAGE_URL = 'https://github.com/ordercraft-hq/terminal';
export const GITHUB_RELEASES_URL = 'https://github.com/ordercraft-hq/terminal/releases';
export const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/ordercraft-hq/terminal/releases/latest';
