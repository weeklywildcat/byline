import { test } from '@playwright/test';
import { defineGeometry } from './story-geometry';

// A drawn 15px scrollbar needs a browser launched without `--hide-scrollbars`,
// which Playwright only accepts at file level.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });
defineGeometry('classic scrollbar');
