import { store } from '../state/store';
import { PALETTE_BY_ID } from '../data/palettes';

export interface PalSearchHandles {
  toggleBtn: HTMLElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  grid: HTMLElement;
  onPick: (code: string) => void;
}

const RENDER_CAP = 600;

/** 全部色号搜索面板：在当前色板里按 色号/名称/HEX 检索，点选设为编辑色。 */
export function setupPaletteSearch(h: PalSearchHandles) {
  h.toggleBtn.addEventListener('click', () => {
    const open = h.panel.hidden;
    h.panel.hidden = !open;
    h.toggleBtn.classList.toggle('on', open);
    if (open) render('');
  });

  h.input.addEventListener('input', () => render(h.input.value.trim().toLowerCase()));

  function render(q: string) {
    const pal = PALETTE_BY_ID[store.get().paletteId];
    if (!pal) return;
    const all = pal.colors;
    const matched = q
      ? all.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.hex.toLowerCase().includes(q))
      : all;
    h.grid.innerHTML = '';
    const shown = matched.slice(0, RENDER_CAP);
    for (const c of shown) {
      const el = document.createElement('button');
      el.className = 'psw' + (store.get().editColor === c.code ? ' on' : '');
      el.title = `${c.code} ${c.name} ${c.hex}`;
      el.style.background = c.hex;
      el.addEventListener('click', () => { h.onPick(c.code); render(q); });
      h.grid.appendChild(el);
    }
    if (matched.length > RENDER_CAP) {
      const note = document.createElement('div');
      note.className = 'psw-note'; note.textContent = `仅显示前 ${RENDER_CAP} / 共 ${matched.length} 色，请缩小搜索`;
      h.grid.appendChild(note);
    }
  }
}
