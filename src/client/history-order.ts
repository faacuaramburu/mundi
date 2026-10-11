import { setTranslatedAria } from './i18n.js';

let closestFirst = true;

export function applyHistoryOrder(history: HTMLElement, revealCorrect = false): void {
  const entries = Array.from(history.children) as HTMLElement[];
  entries.sort((a, b) => closestFirst
    ? Number(b.dataset.correct === 'true') - Number(a.dataset.correct === 'true')
      || Number(a.dataset.distance) - Number(b.dataset.distance) || Number(a.dataset.order) - Number(b.dataset.order)
    : Number(b.dataset.order) - Number(a.dataset.order));
  history.append(...entries);
  if (revealCorrect && entries[0]?.dataset.correct === 'true') history.scrollTop = 0;
}

export function initializeHistoryOrder(): void {
  const button = document.querySelector<HTMLButtonElement>('#history-order');
  const history = document.querySelector<HTMLElement>('#guess-history');
  if (!button || !history) return;
  const renderOrder = (): void => {
    button.setAttribute('aria-pressed', String(closestFirst));
    button.querySelector('.sort-arrow')!.textContent = closestFirst ? '↑' : '↕';
    setTranslatedAria(button, closestFirst ? 'sortRecent' : 'sortDistance');
    applyHistoryOrder(history, true);
  };
  renderOrder();
  button.addEventListener('click', () => {
    closestFirst = !closestFirst;
    renderOrder();
  });
}
