import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/client/i18n.js', () => ({ t: (key: string) => key }));
import { initializePlayerSearch } from '../src/client/player-search.js';
afterEach(() => vi.unstubAllGlobals());
it('prevents native submission and navigates to a normalized same-origin profile', () => {
  const form = new EventTarget(), input = Object.assign(new EventTarget(), { value: 'Alice_Name', setCustomValidity: vi.fn(), reportValidity: vi.fn() });
  const assign = vi.fn();
  vi.stubGlobal('document', { querySelector: (selector: string) => selector === '#player-search' ? form : input });
  vi.stubGlobal('location', { assign });
  initializePlayerSearch();
  const event = new Event('submit', { cancelable: true }); form.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(assign).toHaveBeenCalledWith('/?profile=alice_name');
  assign.mockClear(); input.value = 'https://other.example'; form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(assign).not.toHaveBeenCalled();
  expect(input.reportValidity).toHaveBeenCalled();
  input.dispatchEvent(new Event('input')); expect(input.setCustomValidity).toHaveBeenLastCalledWith('');
});
