import { copyFile } from 'node:fs/promises';

await copyFile('template/pagination.js', 'web/pagination.js');
