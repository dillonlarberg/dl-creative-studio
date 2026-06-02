import { describe, it, expect } from 'vitest';
import { paths } from './paths';

describe('datasource paths', () => {
  it('builds the collection path', () => {
    expect(paths.datasources('nike_na')).toBe('clients/nike_na/datasources');
  });
  it('builds the doc path', () => {
    expect(paths.datasource('nike_na', 'product_feed')).toBe(
      'clients/nike_na/datasources/product_feed',
    );
  });
});
