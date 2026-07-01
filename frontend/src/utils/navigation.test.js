import { normalizePath, samePath } from './navigation';

test('normalizePath removes trailing slashes but keeps root', () => {
  expect(normalizePath('/')).toBe('/');
  expect(normalizePath('/schedule/')).toBe('/schedule');
  expect(normalizePath('/admin///')).toBe('/admin');
});

test('samePath compares normalized route paths', () => {
  expect(samePath('/schedule', '/schedule/')).toBe(true);
  expect(samePath('/', '')).toBe(true);
  expect(samePath('/schedule', '/standings')).toBe(false);
});
