import { registerBlockType } from '@wordpress/blocks';
import { BeforeAfterEdit } from './edit';
import { BeforeAfterSave } from './save';
import deprecated from './deprecated';
import metadata from './block.json';
import './style.css';

registerBlockType(metadata as any, { edit: BeforeAfterEdit, save: BeforeAfterSave as any, deprecated: deprecated as any });
