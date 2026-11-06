import * as migration_20261106_004007_initial from './20261106_004007_initial';
import * as migration_20261106_184806_media_folders_and_library_preview from './20261106_184806_media_folders_and_library_preview';

export const migrations = [
  {
    up: migration_20261106_004007_initial.up,
    down: migration_20261106_004007_initial.down,
    name: '20261106_004007_initial',
  },
  {
    up: migration_20261106_184806_media_folders_and_library_preview.up,
    down: migration_20261106_184806_media_folders_and_library_preview.down,
    name: '20261106_184806_media_folders_and_library_preview'
  },
];
