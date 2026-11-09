import * as migration_20261106_004007_initial from './20261106_004007_initial';
import * as migration_20261106_184806_media_folders_and_library_preview from './20261106_184806_media_folders_and_library_preview';
import * as migration_20261106_233140_collections from './20261106_233140_collections';
import * as migration_20261107_031900_publication_assets from './20261107_031900_publication_assets';
import * as migration_20261107_060721_remove_break_glass from './20261107_060721_remove_break_glass';
import * as migration_20261107_060841_publication_media_pipeline from './20261107_060841_publication_media_pipeline';
import * as migration_20261107_073047_public_snapshot_v1 from './20261107_073047_public_snapshot_v1';
import * as migration_20261107_171524_presence_sessions from './20261107_171524_presence_sessions';
import * as migration_20261107_203133_public_collection_modified_at from './20261107_203133_public_collection_modified_at';
import * as migration_20261107_212937_newsroom_redirects from './20261107_212937_newsroom_redirects';
import * as migration_20261107_214217_newsroom_version_attribution from './20261107_214217_newsroom_version_attribution';
import * as migration_20261107_215529_newsroom_story_activity from './20261107_215529_newsroom_story_activity';
import * as migration_20261107_221914_newsroom_notes_and_health from './20261107_221914_newsroom_notes_and_health';
import * as migration_20261107_224351_remember_story_public_paths from './20261107_224351_remember_story_public_paths';
import * as migration_20261108_163507_video_facts from './20261108_163507_video_facts';
import * as migration_20261108_165129_notifications from './20261108_165129_notifications';
import * as migration_20261108_173200_public_deploy_hook from './20261108_173200_public_deploy_hook';
import * as migration_20261109_035544_reporting from './20261109_035544_reporting';
import * as migration_20261109_130958_front_page from './20261109_130958_front_page';

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
    name: '20261107_060841_publication_media_pipeline',
  },
  {
    up: migration_20261107_073047_public_snapshot_v1.up,
    down: migration_20261107_073047_public_snapshot_v1.down,
    name: '20261107_073047_public_snapshot_v1',
  },
  {
    up: migration_20261107_171524_presence_sessions.up,
    down: migration_20261107_171524_presence_sessions.down,
    name: '20261107_171524_presence_sessions',
  },
  {
    up: migration_20261107_203133_public_collection_modified_at.up,
    down: migration_20261107_203133_public_collection_modified_at.down,
    name: '20261107_203133_public_collection_modified_at',
  },
  {
    up: migration_20261107_212937_newsroom_redirects.up,
    down: migration_20261107_212937_newsroom_redirects.down,
    name: '20261107_212937_newsroom_redirects',
  },
  {
    up: migration_20261107_214217_newsroom_version_attribution.up,
    down: migration_20261107_214217_newsroom_version_attribution.down,
    name: '20261107_214217_newsroom_version_attribution',
  },
  {
    up: migration_20261107_215529_newsroom_story_activity.up,
    down: migration_20261107_215529_newsroom_story_activity.down,
    name: '20261107_215529_newsroom_story_activity',
  },
  {
    up: migration_20261107_221914_newsroom_notes_and_health.up,
    down: migration_20261107_221914_newsroom_notes_and_health.down,
    name: '20261107_221914_newsroom_notes_and_health',
  },
  {
    up: migration_20261107_224351_remember_story_public_paths.up,
    down: migration_20261107_224351_remember_story_public_paths.down,
    name: '20261107_224351_remember_story_public_paths',
  },
  {
    up: migration_20261108_163507_video_facts.up,
    down: migration_20261108_163507_video_facts.down,
    name: '20261108_163507_video_facts',
  },
  {
    up: migration_20261108_165129_notifications.up,
    down: migration_20261108_165129_notifications.down,
    name: '20261108_165129_notifications',
  },
  {
    up: migration_20261108_173200_public_deploy_hook.up,
    down: migration_20261108_173200_public_deploy_hook.down,
    name: '20261108_173200_public_deploy_hook',
  },
  {
    up: migration_20261109_035544_reporting.up,
    down: migration_20261109_035544_reporting.down,
    name: '20261109_035544_reporting',
  },
  {
    up: migration_20261109_130958_front_page.up,
    down: migration_20261109_130958_front_page.down,
    name: '20261109_130958_front_page'
  },
];
