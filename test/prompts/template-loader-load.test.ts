import { describe, it, expect } from 'vitest';
import { TemplateLoader } from '../../extension/src/prompts/TemplateLoader.js';
import * as path from 'path';

describe('TemplateLoader basic load', () => {
  it('can construct TemplateLoader', () => {
    const workspaceRoot = path.join(process.cwd(), 'extension');
    const loader = new TemplateLoader({ workspaceRoot, devMode: true });
    expect(typeof loader.render).toBe('function');
  });
});
