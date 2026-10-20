import { registerBlockType } from '@wordpress/blocks';
import { Edit } from './edit';
import { VisualizationSave } from './save';
import deprecated from './deprecated';
import metadata from './block.json';
import './style.css';
registerBlockType(metadata as any, { edit: Edit, save: VisualizationSave as any, deprecated: deprecated as any });
