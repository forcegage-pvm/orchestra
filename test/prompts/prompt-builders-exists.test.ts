import { describe, it, expect } from 'vitest';
import * as builders from '../../extension/src/prompts/promptTextBuilders.js';

describe('Prompt builders exist', () => {
  it('has code review builders', () => {
    expect(typeof builders.buildSingleTaskCodeReviewPromptText).toBe('function');
    expect(typeof builders.buildBulkCodeReviewPromptText).toBe('function');
    expect(typeof builders.buildCodeReviewReReviewPromptText).toBe('function');
    expect(typeof builders.buildCodeReviewPromptText).toBe('function');
  });
});
