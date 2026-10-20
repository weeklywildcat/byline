import { registerBlockType } from '@wordpress/blocks';
import { AnnotatedImageEdit } from './edit';
import { AnnotatedImageSave } from './save';
import deprecated from './deprecated';
import metadata from './block.json';
import './style.css';

registerBlockType(metadata as any, { edit: AnnotatedImageEdit, save: AnnotatedImageSave as any, deprecated: deprecated as any });
