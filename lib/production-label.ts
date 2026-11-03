const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
  "112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
  "112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
  "124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
];


export function barcodeGeometry(value: string) {
  const digits = value.replace(/[^0-9]/g, "").padStart(6, "0");
  const pairedDigits = digits.length % 2 === 0 ? digits : digits.slice(0, -1);
  const data = pairedDigits.match(/.{2}/g)?.map(Number) ?? [];
  if (digits.length % 2) data.push(100, digits.charCodeAt(digits.length - 1) - 32);
  let checksum = 105;
  data.forEach((code, index) => { checksum += code * (index + 1); });
  const codes = [105, ...data, checksum % 103, 106];
  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }
  return { digits, bars, width: x + 20 };
}

export function productionLabelHtml(label: HTMLElement, code: string): string {
  if (!/^\d{6,}$/.test(code)) throw new Error("La base no confirmó un código válido. No se imprimió la etiqueta.");
  const frozen = label.cloneNode(true) as HTMLElement;
  frozen.querySelectorAll<HTMLElement>("[data-production-code]").forEach((node) => { node.textContent = (node.dataset.productionCode === "hash" ? "#" : "") + code; });
  const { bars, width } = barcodeGeometry(code);
  const placeholder = frozen.querySelector("[data-production-barcode]");
  if (!placeholder) throw new Error("No se encontró el código de barras de la etiqueta.");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns,"svg");
  svg.setAttribute("class","barcode-svg h-11 w-full");
  svg.setAttribute("viewBox",`-10 0 ${width} 42`);
  svg.setAttribute("preserveAspectRatio","none");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Código de barras " + code);
  svg.setAttribute("shape-rendering","crispEdges");
  for (const bar of bars) { const rect=document.createElementNS(ns,"rect"); rect.setAttribute("x",String(bar.x)); rect.setAttribute("y","0"); rect.setAttribute("width",String(bar.width)); rect.setAttribute("height","42"); rect.setAttribute("fill","#000"); svg.appendChild(rect); }
  placeholder.replaceChildren(svg);
  return frozen.outerHTML;
}
