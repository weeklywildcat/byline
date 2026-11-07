import * as migration_20261106_004007_initial from './20261106_004007_initial';
import * as migration_20261106_184806_media_folders_and_library_preview from './20261106_184806_media_folders_and_library_preview';
import * as migration_20261106_233140_collections from './20261106_233140_collections';
import * as migration_20261107_031900_publication_assets from './20261107_031900_publication_assets';
import * as migration_20261107_060721_remove_break_glass from './20261107_060721_remove_break_glass';
import * as migration_20261107_060841_publication_media_pipeline from './20261107_060841_publication_media_pipeline';

export const migrations = [
  {
    up: migration_20261106_004007_initial.up,
    down: migration_20261106_004007_initial.down,
    name: '20261106_004007_initial',
  },
  {
    up: migration_20261106_184806_media_folders_and_library_preview.up,
    down: migration_20261106_184806_media_folders_and_library_preview.down,
    name: '20261106_184806_media_folders_and_library_preview',
  },
  {
    up: migration_20261106_233140_collections.up,
    down: migration_20261106_233140_collections.down,
    name: '20261106_233140_collections',
  },
  {
    up: migration_20261107_031900_publication_assets.up,
    down: migration_20261107_031900_publication_assets.down,
    name: '20261107_031900_publication_assets',
  },
  {
    up: migration_20261107_060721_remove_break_glass.up,
    down: migration_20261107_060721_remove_break_glass.down,
    name: '20261107_060721_remove_break_glass',
  },
  {
    up: migration_20261107_060841_publication_media_pipeline.up,
    down: migration_20261107_060841_publication_media_pipeline.down,
    name: '20261107_060841_publication_media_pipeline'
  },
];
