import { registerBlockType } from '@wordpress/blocks';
import { Edit } from './edit';
import metadata from './block.json';
import './style.css';

// Only editors and administrators are offered the block; PHP passes the answer
// and its save guard enforces it whatever the inserter shows.
const canAdd = Boolean((window as { bylineInteractive?: { canAdd?: boolean } }).bylineInteractive?.canAdd);
registerBlockType(metadata as any, { edit: Edit, save: () => null, supports: { ...metadata.supports, inserter: canAdd } } as any);
