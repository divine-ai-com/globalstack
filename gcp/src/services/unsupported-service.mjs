import { supportClasses } from './support-classes.mjs';

export function createUnsupportedService({ key, name, engineStrategy }) {
  return Object.freeze({
    key,
    name,
    supportClass: supportClasses.unsupported,
    engineStrategy,
    routes() {
      return [];
    },
  });
}
