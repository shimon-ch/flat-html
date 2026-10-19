/**
 * 配色の選択を localStorage に保存し、次のページ読み込みで復元する（ADR-0014 の「JS が足す強化」）。
 * Custom Element ではないので customElements.define はしない。テンプレートの
 * <script type="module" src> から読み込まれ、選択の反映そのものは index.css だけで成立する。
 */

/** localStorage の鍵。テンプレートのラジオの name と同じにして、読む側が 1 つの名前だけ覚えれば済むようにする。 */
const KEY = "flat-color-scheme";

/**
 * 保存先。storage が遮断された文脈（埋め込み、私用閲覧）では localStorage の参照自体が例外を投げるため、
 * その場合は null を返す。保存と復元ができないだけで、配色の切り替えは CSS だけで効く。
 */
function storage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** 保存された選択を復元する。保存がなければ何もせず、テンプレートの既定（system）のままにする。 */
function restore() {
  const saved = storage()?.getItem(KEY);
  if (!saved) return;
  for (const radio of document.querySelectorAll(`input[name="${KEY}"]`)) {
    radio.checked = radio.value === saved;
  }
}

document.addEventListener("change", (event) => {
  const radio = event.target;
  if (!(radio instanceof HTMLInputElement) || radio.name !== KEY) return;
  storage()?.setItem(KEY, radio.value);
});

restore();
