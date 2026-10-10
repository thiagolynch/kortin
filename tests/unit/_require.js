// Módulos do processo principal são CommonJS
import { createRequire } from 'node:module';

export const require = createRequire(import.meta.url);
