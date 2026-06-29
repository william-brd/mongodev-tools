/**
 * Sanitiza o HTML gerado pelo Prismjs antes de dangerouslySetInnerHTML.
 *
 * Prismjs produz apenas <span class="token ...">conteúdo</span> e <br>.
 * Qualquer outra tag HTML no output indica injeção via dados do MongoDB.
 * Esta função remove/escapa tags que não sejam span ou br, neutralizando XSS.
 */
export function sanitizePrism(html: string): string {
  // Allowlist: apenas <span> e <br> que o Prismjs gera.
  // Qualquer outra tag (incluindo variações de caixa como <SCRIPT>, <IMG>) é escapada.
  return html.replace(/<(\/?)([^>]*)>/g, (match, slash, rest) => {
    const tag = rest.split(/[\s>]/)[0].toLowerCase();
    if (tag === "span" || tag === "br") return match;
    return `&lt;${slash}${rest}&gt;`;
  });
}
