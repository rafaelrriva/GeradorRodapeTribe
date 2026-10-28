/* =====================================================================
   GERADOR DE RODAPÉ DE LOGOS — script.js (versão GitHub Pages)
   ---------------------------------------------------------------------
   Site 100% estático: não usa servidor nem banco de dados.
   Os logos e os templates são lidos do arquivo logos/logos.json.
   Para adicionar logos para todos, siga o tutorial em PDF
   (resumo: coloque o PNG na pasta certa e inclua uma linha no JSON).

   Índice
     1. Configuração (manifesto de logos, cores, padrões)
     2. Utilitários (atalhos, aviso flutuante)
     3. Biblioteca de logos (dados, cache de imagens, renderização)
     4. Estado do rodapé (seções, ajustes, salvamento no navegador)
     5. Editor de seções (cartões, chips, arrastar e soltar)
     6. Painel de ajustes
     7. Motor de layout (calcula posição e tamanho de cada elemento)
     8. Desenho no canvas e prévia
     9. Fonte Montserrat
    10. Exportação (PNG, 1920 × 1080 e PSD com artboards)
    11. Manifesto (logos.json) e logos locais do navegador
    12. Envio de logo (tratamento da imagem, salvar e baixar)
    13. Abas do painel lateral
    14. Templates básicos
    15. Área do administrador (publicação via GitHub)
    16. Inicialização
   ===================================================================== */


/* =====================================================================
   1. CONFIGURAÇÃO
   ===================================================================== */

/* Os logos NÃO ficam no código. Eles vêm do arquivo logos/logos.json,
   lido na inicialização (função loadManifest, seção 11):
     • "grupo"          → PNGs em logos/grupo/
     • "farmaceuticas"  → PNGs em logos/farmaceuticas/
                          ("arquivo": "" = vaga sem logo ainda)
     • "templates"      → botões da barra “Templates básicos”
   Os ids são criados a partir do nome:
     grupo → "g_" + nome sem acento/espaço  (ex.: "g_tribemd")
     farma → "f_" + nome com hífens         (ex.: "f_daiichi-sankyo") */
const MANIFEST_URL = "logos/logos.json";
let GROUP_LOGOS = [];    // [{ id, name, src }]
let PHARMA_LOGOS = [];   // [{ id, name, src | null }]
let TEMPLATES = [];      // [{ name, logos: [ids] }]

/* Atalhos de cor exibidos nos Ajustes (cores da identidade) */
const BRAND = ["#2a2a2a", "#563f99", "#b58fff", "#7f7f7f", "#ffffff", "#f3f3f3"];

/* Valores padrão dos Ajustes (também usados por “Restaurar padrão”) */
const DEFAULTS = {
  layout: "row",          // "row" lado a lado · "stack" empilhadas · "auto"
  fill: false,            // forçar largura de 1080 px
  logoH: 56,              // altura base dos logos (px)
  maxW: 190,              // largura máxima de um logo (px)
  gap: 28,                // espaço entre logos
  secGap: 28,             // espaço entre o conteúdo e a linha divisória
  pad: 30,                // margem interna da caixa branca
  radius: 24,             // arredondamento da caixa
  titleSize: 14,          // tamanho do título das seções
  titleWeight: "600",     // peso da Montserrat
  align: "center",        // alinhamento dos títulos e logos
  upper: false,           // títulos em maiúsculas
  titleColor: "#2a2a2a",
  lineColor: "#d9d6e0",
  lineW: 1,               // espessura da linha (0 = sem linha)
  bg: "#ffffff",          // fundo da caixa
  vMargin: 60             // espaço até a borda inferior no quadro 1920 × 1080
};

/* Limites do rodapé exportado */
const MAXW = 1080, MAXH = 600;

/* Largura máxima do rodapé fino (título ao lado), igual à do quadro de vídeo */
const MAXW_INLINE = 1920;

/* Tamanho do quadro de vídeo */
const VW = 1920, VH = 1080;


/* =====================================================================
   2. UTILITÁRIOS
   ===================================================================== */

/* Texto → forma simplificada (sem acento, minúsculo, com hífens).
   Usado na pesquisa e para criar ids. */
const slug = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Atalho para document.getElementById */
const $ = id => document.getElementById(id);

/* Id aleatório curto (seções e logos enviados) */
const uid = () => Math.random().toString(36).slice(2, 9);

/* Aviso flutuante que some sozinho depois de alguns segundos */
const toastEl = $("toast");
let toastTimer;
function toast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), ms);
}


/* =====================================================================
   3. BIBLIOTECA DE LOGOS
   ===================================================================== */

/* lib: todos os logos disponíveis, por id.
   Cada item: { id, name, group: "grupo"|"farma", src, builtin?, local? }
   builtin = veio do logos.json (não pode ser excluído pelo site)
   local   = enviado neste navegador (fica só aqui; pode ser excluído) */
const lib = new Map();
let localLogos = [];

/* Monta a biblioteca: logos do manifesto + logos locais do navegador.
   Um logo local enviado para uma vaga de farmacêutica usa o mesmo id
   da vaga e por isso a “preenche” (só neste navegador). */
function rebuildLib() {
  lib.clear();
  GROUP_LOGOS.forEach(l => lib.set(l.id, { ...l, group: "grupo", builtin: true }));
  PHARMA_LOGOS.forEach(l => lib.set(l.id, { ...l, group: "farma", builtin: !!l.src }));
  localLogos.forEach(d => {
    const prev = lib.get(d.id);
    lib.set(d.id, {
      id: d.id,
      name: d.name || (prev && prev.name) || "Logo",
      group: d.group === "grupo" ? "grupo" : "farma",
      src: d.dataUrl,
      local: true
    });
  });
}

/* Cache de imagens: cada src é carregado uma vez. Enquanto a imagem
   não carrega, getImg devolve null e o layout usa uma proporção
   provisória; quando termina, a prévia é redesenhada. */
const imgCache = new Map();
function getImg(src) {
  if (!src) return null;
  let entry = imgCache.get(src);
  if (!entry) {
    const img = new Image();
    entry = { img, ok: false };
    imgCache.set(src, entry);
    img.onload = () => { entry.ok = true; scheduleRender(); };
    img.decoding = "async";
    img.src = src;
  }
  return entry.ok ? entry.img : null;
}

/* Filtro ativo da biblioteca ("all", "grupo", "farma") */
let filter = "all";

/* Desenha a grade da biblioteca de acordo com pesquisa e filtro.
   Ordem: grupo → farmacêuticas (com logo primeiro).
   O primeiro bloco é “+ Novo logo”, que abre o envio já na categoria
   da aba aberta (em “Todos”, o padrão é Farmacêuticas). */
function renderLib() {
  const q = slug($("q").value || "");
  const box = $("lib");
  box.textContent = "";

  // Bloco “+ Novo logo” (só para quem pode enviar)
  if (canWrite) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "tile add";
    const plus = document.createElement("span");
    plus.className = "plus"; plus.textContent = "+";
    const label = document.createElement("span");
    label.textContent = admin.on
      ? (filter === "grupo" ? "Publicar logo do grupo" : filter === "farma" ? "Publicar farmacêutica" : "Publicar novo logo")
      : (filter === "grupo" ? "Novo logo do grupo" : filter === "farma" ? "Nova farmacêutica" : "Novo logo");
    add.append(plus, label);
    // O texto da pesquisa vira sugestão de nome
    add.addEventListener("click", () => openUpload({ group: filter === "grupo" ? "grupo" : "farma", name: $("q").value.trim() }));
    box.append(add);
  }

  const order = { grupo: 0, farma: 1 };
  const items = [...lib.values()]
    .filter(l => (filter === "all" || l.group === filter) && (!q || slug(l.name).includes(q)))
    .sort((a, b) =>
      (order[a.group] - order[b.group]) ||
      ((!!b.src) - (!!a.src)) ||
      a.name.localeCompare(b.name, "pt-BR"));

  // Nada encontrado
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "small muted";
    p.style.gridColumn = "1/-1";
    p.textContent = "Nenhum logo com esse nome. Use “+ Novo logo” para adicioná-lo.";
    box.append(p);
    return;
  }

  for (const l of items) {
    const tile = document.createElement("div");
    tile.className = "tile" + (l.src ? "" : " missing");
    tile.tabIndex = 0;
    tile.title = l.name;

    if (l.src) {
      // Logo disponível: imagem + nome no hover
      const im = document.createElement("img");
      im.alt = l.name; im.src = l.src; im.loading = "lazy";
      const nm = document.createElement("div");
      nm.className = "nm"; nm.textContent = l.name;
      tile.append(im, nm);

      // Arrastar: leva o id do logo para a área de soltar da seção
      tile.draggable = true;
      tile.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/x-logo", l.id);
        e.dataTransfer.effectAllowed = "copy";
      });

      // Clique ou Enter: adiciona à seção selecionada
      const add = () => addToActive(l.id);
      tile.addEventListener("click", add);
      tile.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); add(); }
      });

      // Logos enviados podem ser excluídos (os que vêm no site não).
      // 1º clique pede confirmação; 2º clique (em até 2,6 s) exclui.
      if (!l.builtin) {
        const x = document.createElement("button");
        x.className = "x"; x.type = "button"; x.textContent = "×";
        x.setAttribute("aria-label", "Excluir " + l.name);
        x.addEventListener("click", e => {
          e.stopPropagation();
          if (!x.classList.contains("confirm")) {
            x.classList.add("confirm"); x.textContent = "Excluir?";
            setTimeout(() => { x.classList.remove("confirm"); x.textContent = "×"; }, 2600);
            return;
          }
          deleteLogo(l);
        });
        tile.append(x);
      }

      // Modo administrador: trocar ou remover o logo PARA TODOS (via GitHub).
      // “Remover” também pede confirmação com um segundo clique.
      if (admin.on && l.builtin) {
        tile.classList.add("has-adm");
        const bar = document.createElement("div");
        bar.className = "adm";
        const tr = document.createElement("button");
        tr.type = "button"; tr.textContent = "Trocar";
        tr.addEventListener("click", e => { e.stopPropagation(); openUpload({ replace: l, name: l.name, group: l.group }); });
        const rm = document.createElement("button");
        rm.type = "button"; rm.className = "rm"; rm.textContent = "Remover";
        rm.addEventListener("click", e => {
          e.stopPropagation();
          if (!rm.classList.contains("confirm")) {
            rm.classList.add("confirm"); rm.textContent = "Confirmar?";
            setTimeout(() => { rm.classList.remove("confirm"); rm.textContent = "Remover"; }, 2600);
            return;
          }
          adminRemove(l);
        });
        bar.append(tr, rm);
        tile.append(bar);
      }
    } else {
      // Vaga de farmacêutica sem logo: clique abre o envio já com o nome
      const b = document.createElement("b"); b.textContent = l.name;
      const s = document.createElement("span"); s.textContent = admin.on ? "Publicar logo" : "Enviar logo";
      tile.append(b, s);
      const open = () => openUpload({ slot: l.id, name: l.name });
      tile.addEventListener("click", open);
      tile.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    }
    box.append(tile);
  }
}

// Pesquisa e filtros
$("q").addEventListener("input", renderLib);
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderLib();
}));


/* =====================================================================
   4. ESTADO DO RODAPÉ
   state = {
     settings: { ...valores dos Ajustes },
     sections: [ { id, title, logos: [ { ref: idDoLogo, scale } ] } ],
     active: id da seção selecionada
   }
   Fica salvo no localStorage do navegador de cada pessoa.
   ===================================================================== */
const STORAGE_KEY = "rodape-logos-v1";

/* Estado inicial: Realização (com TribeMD), Patrocínio e Apoio educacional */
function freshState() {
  return {
    settings: { ...DEFAULTS },
    sections: [
      { id: "s1", title: "Realização",        logos: [{ ref: "g_tribemd", scale: 1 }] },
      { id: "s2", title: "Patrocínio",        logos: [] },
      { id: "s3", title: "Apoio educacional", logos: [] }
    ],
    active: "s2"
  };
}

/* Carrega o estado salvo (ou cria um novo) */
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { state = null; }
if (!state || !Array.isArray(state.sections)) state = freshState();
state.settings = { ...DEFAULTS, ...state.settings };   // completa ajustes novos
state.settings.radius = Math.min(100, state.settings.radius);   // arredondamento máximo: 100 px

/* Salva com atraso de 300 ms para não gravar a cada tecla */
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* navegador sem storage */ }
  }, 300);
}

/* Chamado após qualquer alteração.
   structural = true → redesenha também os cartões das seções. */
function changed(structural) {
  persist();
  if (structural) renderSecs();
  scheduleRender();
}

/* Adiciona um logo à seção selecionada (clique na biblioteca) */
function addToActive(ref) {
  let sec = state.sections.find(s => s.id === state.active) || state.sections[0];
  if (!sec) {
    sec = { id: "s" + uid(), title: "Nova seção", logos: [] };
    state.sections.push(sec);
    state.active = sec.id;
  }
  sec.logos.push({ ref, scale: 1 });
  changed(true);
  const l = lib.get(ref);
  toast("“" + (l ? l.name : "Logo") + "” adicionado a “" + (sec.title || "seção") + "”", 1800);
}


/* =====================================================================
   5. EDITOR DE SEÇÕES
   ===================================================================== */

/* Chip sendo arrastado: { si: índice da seção, li: índice do logo } */
let dragChip = null;

/* Cria um botão pequeno de símbolo. “×” recebe a classe vermelha. */
function iconButton(txt, label, onClick, disabled) {
  const b = document.createElement("button");
  b.className = "ico" + (txt === "×" ? " del" : "");
  b.type = "button";
  b.textContent = txt;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.disabled = !!disabled;
  if (disabled) b.style.opacity = .3;
  b.addEventListener("click", onClick);
  return b;
}

/* Desenha todos os cartões de seção */
function renderSecs() {
  const box = $("secs");
  box.textContent = "";

  state.sections.forEach((sec, si) => {
    const card = document.createElement("section");
    card.className = "sec" + (state.active === sec.id ? " active" : "");

    // Tocar no cartão torna a seção “selecionada”
    card.addEventListener("pointerdown", () => {
      if (state.active === sec.id) return;
      state.active = sec.id;
      persist();
      document.querySelectorAll(".sec").forEach(c => c.classList.toggle("active", c === card));
    });

    // --- Linha de cima: título editável, mover ‹ ›, excluir × ---
    const top = document.createElement("div");
    top.className = "sec-top";
    const input = document.createElement("input");
    input.className = "sec-title";
    input.value = sec.title;
    input.placeholder = "Título (opcional)";
    input.setAttribute("aria-label", "Título da seção");
    input.addEventListener("input", () => { sec.title = input.value; changed(false); });

    top.append(
      input,
      iconButton("‹", "Mover para a esquerda", () => {
        state.sections.splice(si, 1); state.sections.splice(si - 1, 0, sec); changed(true);
      }, si === 0),
      iconButton("›", "Mover para a direita", () => {
        state.sections.splice(si, 1); state.sections.splice(si + 1, 0, sec); changed(true);
      }, si === state.sections.length - 1),
      iconButton("×", "Excluir seção", () => {
        state.sections.splice(si, 1);
        if (state.active === sec.id) state.active = state.sections[0] && state.sections[0].id;
        changed(true);
      })
    );

    // --- Área de soltar com os logos (chips) ---
    const zone = document.createElement("div");
    zone.className = "zone";
    if (!sec.logos.length) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Arraste logos para cá";
      zone.append(hint);
    }

    sec.logos.forEach((item, li) => {
      const l = lib.get(item.ref);
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.draggable = true;
      chip.title = l ? l.name : "Logo removido";

      // Miniatura
      const th = document.createElement("div");
      th.className = "th";
      if (l && l.src) { const im = document.createElement("img"); im.src = l.src; im.alt = ""; th.append(im); }

      // Escala individual do logo (40% a 200%, passos de 10%)
      const sc = document.createElement("span");
      sc.className = "sc";
      sc.textContent = Math.round(item.scale * 100) + "%";
      const setScale = d => {
        item.scale = Math.min(2, Math.max(.4, Math.round((item.scale + d) * 10) / 10));
        sc.textContent = Math.round(item.scale * 100) + "%";
        changed(false);
      };

      chip.append(
        th,
        iconButton("−", "Diminuir logo", () => setScale(-.1)),
        sc,
        iconButton("+", "Aumentar logo", () => setScale(.1)),
        iconButton("×", "Remover do rodapé", () => { sec.logos.splice(li, 1); changed(true); })
      );

      // Arrastar chip para reordenar ou mover para outra seção
      chip.addEventListener("dragstart", e => {
        dragChip = { si, li };
        e.dataTransfer.setData("text/x-chip", "1");
        e.dataTransfer.effectAllowed = "move";
        chip.classList.add("dragging");
      });
      chip.addEventListener("dragend", () => { dragChip = null; chip.classList.remove("dragging"); });

      // Soltar EM CIMA de um chip = inserir antes dele
      chip.addEventListener("dragover", e => { e.preventDefault(); chip.classList.add("drop-before"); });
      chip.addEventListener("dragleave", () => chip.classList.remove("drop-before"));
      chip.addEventListener("drop", e => {
        e.preventDefault(); e.stopPropagation();
        chip.classList.remove("drop-before");
        zone.classList.remove("over");
        handleDrop(e, sec, li);
      });

      zone.append(chip);
    });

    // Soltar na área vazia = colocar no fim da seção
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("over"); });
    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("over");
      handleDrop(e, sec, sec.logos.length);
    });

    card.append(top, zone);
    box.append(card);
  });
  markTemplate();   // atualiza o destaque dos templates
}

/* Trata o “soltar”: logo vindo da biblioteca OU chip vindo de uma seção */
function handleDrop(e, sec, index) {
  const ref = e.dataTransfer.getData("text/x-logo");
  if (ref) {
    sec.logos.splice(index, 0, { ref, scale: 1 });
    state.active = sec.id;
    changed(true);
    return;
  }
  if (dragChip) {
    const from = state.sections[dragChip.si];
    const [item] = from.logos.splice(dragChip.li, 1);
    if (from === sec && dragChip.li < index) index--;   // compensa a remoção na mesma seção
    sec.logos.splice(index, 0, item);
    dragChip = null;
    changed(true);
  }
}

// Botão “Adicionar seção”
$("addSec").addEventListener("click", () => {
  const s = { id: "s" + uid(), title: "Nova seção", logos: [] };
  state.sections.push(s);
  state.active = s.id;
  changed(true);
});


/* =====================================================================
   6. PAINEL DE AJUSTES
   Cada controle tem id "s_<chave>" ligado a state.settings[chave].
   ===================================================================== */

/* Controles deslizantes (mostram o valor em px no <output>) */
const RANGES = ["logoH", "maxW", "gap", "secGap", "pad", "radius", "titleSize", "lineW", "vMargin"];

/* Controles rápidos acima da prévia (formato + arredondamento) */
function syncQuick() {
  const S = state.settings;
  $("q_radius").value = S.radius;
  $("oq_radius").textContent = S.radius + " px";
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.layout === S.layout ? "true" : "false"));
}
document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
  state.settings.layout = b.dataset.layout;
  syncSettingsUI();
  changed(false);
}));
$("q_radius").addEventListener("input", e => {
  state.settings.radius = +e.target.value;
  syncSettingsUI();
  changed(false);
});

/* Copia state.settings para os campos da tela */
function syncSettingsUI() {
  const S = state.settings;
  RANGES.forEach(k => { $("s_" + k).value = S[k]; $("o_" + k).textContent = S[k] + " px"; });
  $("s_layout").value = S.layout;
  $("s_fill").checked = S.fill;
  $("s_titleWeight").value = S.titleWeight;
  $("s_align").value = S.align;
  $("s_upper").checked = S.upper;
  ["titleColor", "lineColor", "bg"].forEach(k => $("s_" + k).value = S[k]);
  syncQuick();
}

// Deslizantes
RANGES.forEach(k => $("s_" + k).addEventListener("input", e => {
  state.settings[k] = +e.target.value;
  $("o_" + k).textContent = e.target.value + " px";
  syncQuick();
  changed(false);
}));

// Listas de seleção
["layout", "titleWeight", "align"].forEach(k => $("s_" + k).addEventListener("change", e => {
  state.settings[k] = e.target.value;
  if (k === "titleWeight") loadWeight();     // carrega o peso da fonte antes de desenhar
  syncQuick();
  changed(false);
}));

// Caixas de seleção
["fill", "upper"].forEach(k => $("s_" + k).addEventListener("change", e => {
  state.settings[k] = e.target.checked;
  changed(false);
}));

// Seletores de cor
["titleColor", "lineColor", "bg"].forEach(k => $("s_" + k).addEventListener("input", e => {
  state.settings[k] = e.target.value;
  changed(false);
}));

// Bolinhas de cor da identidade ao lado de cada seletor
document.querySelectorAll(".swatches").forEach(wrap => {
  BRAND.forEach(color => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sw";
    b.style.background = color;
    b.setAttribute("aria-label", color);
    b.addEventListener("click", () => {
      const key = wrap.dataset.for.slice(2);      // "s_titleColor" → "titleColor"
      state.settings[key] = color;
      $(wrap.dataset.for).value = color;
      changed(false);
    });
    wrap.append(b);
  });
});

// Restaurar padrão
$("resetBtn").addEventListener("click", () => {
  state.settings = { ...DEFAULTS };
  syncSettingsUI();
  loadWeight();
  changed(false);
});


/* =====================================================================
   7. MOTOR DE LAYOUT
   Calcula, sem desenhar, a lista de elementos do rodapé:
     { type: "text" | "logo" | "line", x, y, w, h, ... }
   O mesmo resultado é usado para a prévia, o PNG e o PSD.
   ===================================================================== */

/* Canvas invisível só para medir a largura dos títulos */
const measureCtx = document.createElement("canvas").getContext("2d");

/* Título da seção (em maiúsculas se o ajuste estiver ligado) */
function titleText(sec) {
  return state.settings.upper ? (sec.title || "").toLocaleUpperCase("pt-BR") : (sec.title || "");
}

/* Configura a fonte do canvas. Em maiúsculas, adiciona espaçamento. */
function setFont(ctx, S, size) {
  ctx.font = `${S.titleWeight} ${size}px Montserrat, Arial, sans-serif`;
  try { ctx.letterSpacing = S.upper ? (size * .08) + "px" : "0px"; } catch (e) { /* navegador antigo */ }
}

/* Junta cada seção com seus logos já resolvidos (imagem + proporção).
   Seções vazias e logos sem imagem ficam de fora do rodapé. */
function prepared() {
  return state.sections.map(s => ({
    s,
    items: s.logos.map(item => {
      const l = lib.get(item.ref);
      if (!l || !l.src) return null;
      const img = getImg(l.src);
      const aspect = img ? img.naturalWidth / img.naturalHeight : 3;   // 3 = provisório
      return { item, l, img, a: aspect || 3 };
    }).filter(Boolean)
  })).filter(x => x.items.length);
}

/* Tamanho de um logo: altura padrão × escala; se ficar largo demais,
   limita pela largura máxima (assim logos horizontais não dominam). */
function sizeItem(x, logoH, maxW) {
  let h = logoH * x.item.scale;
  let w = h * x.a;
  const cap = maxW * x.item.scale;
  if (w > cap) { w = cap; h = w / x.a; }
  return { w, h };
}

/* Monta o layout num modo ("row" ou "stack") com fator de escala k.
   k < 1 reduz tudo proporcionalmente quando não cabe em 1080 × 600. */
function build(secs, mode, k) {
  const S = state.settings;
  const logoH = S.logoH * k, maxW = S.maxW * k, gap = S.gap * k, pad = S.pad * k;
  const sg = S.secGap * k, ts = S.titleSize * k, lw = S.lineW;

  setFont(measureCtx, S, ts);
  const anyTitle = secs.some(x => titleText(x.s).trim());
  const tH = anyTitle ? ts * 1.25 : 0;                 // altura da faixa do título
  const tGap = anyTitle ? Math.max(6, ts * .9) : 0;    // espaço título → logos

  const els = [];
  const blocks = secs.map(x => {
    const t = titleText(x.s).trim();
    return { x, t, tw: t ? measureCtx.measureText(t).width : 0, sizes: x.items.map(i => sizeItem(i, logoH, maxW)) };
  });
  let W, H;

  if (mode === "inline") {
    /* ---- TÍTULO AO LADO (rodapé fino) ----
       O título fica à esquerda de cada grupo de logos, centralizado na
       altura. Títulos longos quebram em até 2 linhas (ex.: “Apoio /
       educacional”). Margem vertical menor e lateral maior deixam o
       rodapé fino. Largura máxima: 1920 px. */
    const padY = pad * .55, padX = pad * 1.8;
    const tGapX = Math.max(10, ts * 1.6);     // espaço título → logos
    const lineH = ts * 1.2;
    blocks.forEach(b => {
      b.cw = b.sizes.reduce((a, z) => a + z.w, 0) + gap * (b.sizes.length - 1);
      b.mh = Math.max(...b.sizes.map(z => z.h));
      b.lines = [];
      if (b.t) {
        const words = b.t.split(/\s+/);
        const limit = Math.max(ts * 7, ...words.map(w => measureCtx.measureText(w).width));
        let cur = "";
        words.forEach(w => {
          const test = cur ? cur + " " + w : w;
          if (cur && b.lines.length < 1 && measureCtx.measureText(test).width > limit) { b.lines.push(cur); cur = w; }
          else cur = test;
        });
        if (cur) b.lines.push(cur);
      }
      b.tw2 = b.lines.length ? Math.max(...b.lines.map(l => measureCtx.measureText(l).width)) : 0;
      b.th = b.lines.length * lineH;
      b.w = (b.tw2 ? b.tw2 + tGapX : 0) + b.cw;
    });
    const band = Math.max(...blocks.map(b => Math.max(b.mh, b.th)));
    W = 2 * padX + blocks.reduce((a, b) => a + b.w, 0) + (blocks.length - 1) * (2 * sg + lw);
    // “Ocupar largura total”: distribui a sobra entre os grupos
    if (S.fill && W < MAXW_INLINE) {
      const extra = (MAXW_INLINE - W) / blocks.length;
      blocks.forEach(b => b.extra = extra);
      W = MAXW_INLINE;
    }
    H = 2 * padY + band;

    let x = padX;
    blocks.forEach((b, i) => {
      const extra = b.extra || 0;
      let cx = x + extra / 2;
      if (b.lines.length) {
        els.push({ type: "text", text: b.lines.join(" "), lines: b.lines, lh: lineH,
                   x: cx, y: padY + (band - b.th) / 2, h: b.th, w: b.tw2, align: "left", size: ts });
        cx += b.tw2 + tGapX;
      }
      b.x.items.forEach((it, j) => {
        const z = b.sizes[j];
        els.push({ type: "logo", img: it.img, name: it.l.name, x: cx, y: padY + (band - z.h) / 2, w: z.w, h: z.h });
        cx += z.w + gap;
      });
      x += b.w + extra;
      if (i < blocks.length - 1) {
        if (lw > 0) els.push({ type: "line", x: x + sg, y: padY, w: lw, h: band });
        x += 2 * sg + lw;
      }
    });

  } else if (mode === "row") {
    /* ---- SEÇÕES LADO A LADO ----
       Cada seção é uma coluna; linhas divisórias verticais entre elas.
       Todos os logos ficam centralizados numa mesma faixa de altura. */
    blocks.forEach(b => {
      b.cw = b.sizes.reduce((a, z) => a + z.w, 0) + gap * (b.sizes.length - 1);  // largura dos logos
      b.w = Math.max(b.cw, b.tw);                                                // largura da coluna
      b.mh = Math.max(...b.sizes.map(z => z.h));                                 // logo mais alto
    });
    const band = Math.max(...blocks.map(b => b.mh));
    const dividers = (blocks.length - 1) * (2 * sg + lw);
    W = 2 * pad + blocks.reduce((a, b) => a + b.w, 0) + dividers;

    // “Ocupar largura total”: distribui a sobra igualmente entre as colunas
    if (S.fill && W < MAXW) {
      const extra = (MAXW - W) / blocks.length;
      blocks.forEach(b => b.w += extra);
      W = MAXW;
    }
    H = 2 * pad + tH + tGap + band;

    let x = pad;
    blocks.forEach((b, i) => {
      if (b.t) els.push({ type: "text", text: b.t, x: S.align === "center" ? x + b.w / 2 : x, y: pad, h: tH, w: b.tw, align: S.align, size: ts });
      let lx = S.align === "center" ? x + (b.w - b.cw) / 2 : x;
      b.x.items.forEach((it, j) => {
        const z = b.sizes[j];
        els.push({ type: "logo", img: it.img, name: it.l.name, x: lx, y: pad + tH + tGap + (band - z.h) / 2, w: z.w, h: z.h });
        lx += z.w + gap;
      });
      x += b.w;
      if (i < blocks.length - 1) {
        if (lw > 0) els.push({ type: "line", x: x + sg, y: pad, w: lw, h: H - 2 * pad });
        x += 2 * sg + lw;
      }
    });

  } else {
    /* ---- SEÇÕES EMPILHADAS ----
       Cada seção é uma faixa horizontal; logos quebram em linhas
       quando passam da largura disponível. Linhas divisórias
       horizontais entre as seções. */
    const inner = MAXW - 2 * pad, gapY = gap * .7;
    blocks.forEach(b => {
      const rows = [];
      let cur = [], cw = 0;
      b.sizes.forEach((z, j) => {
        const add = (cur.length ? gap : 0) + z.w;
        if (cur.length && cw + add > inner) { rows.push({ items: cur, w: cw }); cur = []; cw = 0; }
        cw += (cur.length ? gap : 0) + z.w;
        cur.push(j);
      });
      if (cur.length) rows.push({ items: cur, w: cw });
      rows.forEach(r => r.h = Math.max(...r.items.map(j => b.sizes[j].h)));
      b.rows = rows;
      b.w = Math.max(b.tw, ...rows.map(r => r.w));
      b.bh = (b.t ? tH + tGap : 0) + rows.reduce((a, r) => a + r.h, 0) + gapY * (rows.length - 1);
    });
    W = S.fill ? MAXW : Math.min(MAXW, 2 * pad + Math.max(...blocks.map(b => b.w)));
    const iw = W - 2 * pad;
    H = 2 * pad + blocks.reduce((a, b) => a + b.bh, 0) + (blocks.length - 1) * (2 * sg + lw);

    let y = pad;
    blocks.forEach((b, i) => {
      if (b.t) {
        els.push({ type: "text", text: b.t, x: S.align === "center" ? pad + iw / 2 : pad, y, h: tH, w: b.tw, align: S.align, size: ts });
        y += tH + tGap;
      }
      b.rows.forEach((r, ri) => {
        let lx = S.align === "center" ? pad + (iw - r.w) / 2 : pad;
        r.items.forEach(j => {
          const z = b.sizes[j], it = b.x.items[j];
          els.push({ type: "logo", img: it.img, name: it.l.name, x: lx, y: y + (r.h - z.h) / 2, w: z.w, h: z.h });
          lx += z.w + gap;
        });
        y += r.h + (ri < b.rows.length - 1 ? gapY : 0);
      });
      if (i < blocks.length - 1) {
        if (lw > 0) els.push({ type: "line", x: pad, y: y + sg, w: iw, h: lw });
        y += 2 * sg + lw;
      }
    });
  }

  W = Math.ceil(W);
  H = Math.ceil(H);
  return { W, H, els, k, mode, fits: W <= (mode === "inline" ? MAXW_INLINE : MAXW) && H <= MAXH };
}

/* Escolhe o layout final: começa em 100% e vai reduzindo de 2,5% em
   2,5% (até 30%) até caber em 1080 × 600. No modo “Automática”, para
   cada tamanho tenta primeiro lado a lado e depois empilhado. */
function layout() {
  const secs = prepared();
  if (!secs.length) return null;
  const S = state.settings;
  const modes = S.layout === "auto" ? ["row", "stack"] : [S.layout];
  let last;
  for (let k = 1; k >= .3; k = Math.round((k - .025) * 1000) / 1000) {
    for (const m of modes) {
      last = build(secs, m, k);
      if (last.fits) return last;
    }
  }
  return last;
}


/* =====================================================================
   8. DESENHO NO CANVAS E PRÉVIA
   ===================================================================== */

/* Caminho de retângulo com cantos arredondados */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Desenha UM elemento. ox/oy deslocam a origem (usado para gerar
   cada camada do PSD no seu próprio canvas). */
function drawEl(ctx, e, S, ox = 0, oy = 0) {
  if (e.type === "bg") {
    ctx.fillStyle = S.bg;
    roundRect(ctx, e.x - ox, e.y - oy, e.w, e.h, S.radius);
    ctx.fill();
  } else if (e.type === "line") {
    ctx.fillStyle = S.lineColor;
    ctx.fillRect(e.x - ox, e.y - oy, e.w, e.h);
  } else if (e.type === "text") {
    setFont(ctx, S, e.size);
    ctx.fillStyle = S.titleColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = e.align === "center" ? "center" : "left";
    // Título em mais de uma linha (rodapé fino) ou em uma linha só
    if (e.lines && e.lines.length > 1) e.lines.forEach((ln, i) => ctx.fillText(ln, e.x - ox, e.y + e.lh * (i + .5) - oy));
    else ctx.fillText(e.text, e.x - ox, e.y + e.h / 2 - oy);
  } else if (e.type === "logo" && e.img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(e.img, e.x - ox, e.y - oy, e.w, e.h);
  }
}

/* Desenha o rodapé inteiro: fundo arredondado + todos os elementos */
function drawAll(ctx, L) {
  const S = state.settings;
  drawEl(ctx, { type: "bg", x: 0, y: 0, w: L.W, h: L.H }, S);
  L.els.forEach(e => drawEl(ctx, e, S));
}

/* Agrupa vários pedidos de redesenho num único quadro de animação */
let renderQueued = null;
let current = null;                    // último layout calculado
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = requestAnimationFrame(() => { renderQueued = null; render(); });
}

/* Recalcula o layout e desenha a prévia, as dimensões e a miniatura */
function render() {
  const cv = $("cv");
  current = layout();

  // Sem logos: mostra a mensagem e desativa os downloads
  if (!current) {
    cv.hidden = true;
    $("emptyMsg").hidden = false;
    $("dims").textContent = "vazio";
    $("fitnote").textContent = "";
    $("pngBtn").disabled = $("psdBtn").disabled = $("vidBtn").disabled = true;
    drawMini();
    return;
  }
  cv.hidden = false;
  $("emptyMsg").hidden = true;
  $("pngBtn").disabled = $("psdBtn").disabled = $("vidBtn").disabled = false;

  // Prévia nítida em telas retina (desenha em 2×, exibe em 1×)
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(current.W * dpr);
  cv.height = Math.round(current.H * dpr);
  cv.style.width = current.W + "px";
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, current.W, current.H);
  drawAll(ctx, current);

  $("dims").textContent = current.W + " × " + current.H + " px";
  $("fitnote").textContent = current.k < 1
    ? "· logos reduzidos a " + Math.round(current.k * 100) + "% para caber em " + (current.mode === "inline" ? "1920 px de largura" : "1080 × 600")
    : "";
  drawMini();
}

/* Posição do rodapé no quadro 1920 × 1080: centro na horizontal,
   embaixo, respeitando o espaço até a borda inferior. */
function vPos() {
  const m = Math.min(state.settings.vMargin, VH - current.H);
  return { x: Math.round((VW - current.W) / 2), y: VH - current.H - m };
}

/* Miniatura do quadro de vídeo (canvas #vcv, 960 × 540 = metade) */
function drawMini() {
  const vc = $("vcv"), ctx = vc.getContext("2d"), s = vc.width / VW;
  ctx.clearRect(0, 0, vc.width, vc.height);
  if (!current) return;
  const p = vPos();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage($("cv"), p.x * s, p.y * s, current.W * s, current.H * s);
}


/* =====================================================================
   9. FONTE MONTSERRAT
   O canvas só usa a fonte se ela já estiver carregada; por isso o
   peso escolhido é carregado antes e a prévia é redesenhada depois.
   ===================================================================== */
function loadWeight() {
  const w = state.settings.titleWeight;
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`${w} 20px Montserrat`).then(scheduleRender, () => {});
  }
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRender);


/* =====================================================================
   10. EXPORTAÇÃO
   ===================================================================== */

/* Canvas do rodapé em tamanho real (1×), fundo transparente */
function exportCanvas() {
  const c = document.createElement("canvas");
  c.width = current.W;
  c.height = current.H;
  drawAll(c.getContext("2d"), current);
  return c;
}

/* Canvas 1920 × 1080 transparente com o rodapé embaixo */
function verticalCanvas() {
  const c = document.createElement("canvas");
  c.width = VW;
  c.height = VH;
  const p = vPos();
  c.getContext("2d").drawImage(exportCanvas(), p.x, p.y);
  return c;
}

/* Data e hora para o nome do arquivo: AAAAMMDD-HHMM */
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}

/* Salva um arquivo no computador (link de download temporário) */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Espera a fonte e redesenha antes de exportar (garante Montserrat) */
async function readyToExport() {
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  render();
}

// Baixar PNG (só o rodapé)
$("pngBtn").addEventListener("click", async () => {
  if (!current) return;
  await readyToExport();
  exportCanvas().toBlob(b => saveBlob(b, "rodape-" + stamp() + ".png"), "image/png");
});

// Baixar 1920 × 1080
$("vidBtn").addEventListener("click", async () => {
  if (!current) return;
  await readyToExport();
  verticalCanvas().toBlob(b => saveBlob(b, "rodape-1920x1080-" + stamp() + ".png"), "image/png");
});

/* Carrega uma biblioteca externa só quando for usada (PSD e ZIP são
   pesados e só servem para o botão “Baixar PSD”). */
function loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) return resolve(window[globalName]);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(window[globalName]);
    s.onerror = () => reject(new Error("Falha ao carregar " + src));
    document.head.append(s);
  });
}

/* Baixar PSD: gera um .zip com
     • rodape-XXXX.psd  → 2 artboards no mesmo arquivo:
         1) “Rodapé W×H”        (o rodapé sozinho)
         2) “Vídeo 1920×1080”   (o quadro com o rodapé embaixo)
       cada uma com camadas separadas: Fundo, Linhas, Títulos, Logos
     • rodape-XXXX.png e rodape-XXXX-1920x1080.png
   Bibliotecas: ag-psd (escreve PSD) e JSZip (compacta). */
$("psdBtn").addEventListener("click", async () => {
  if (!current) return;
  const btn = $("psdBtn"), originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Gerando PSD…";
  try {
    const [agPsd, JSZip] = await Promise.all([
      loadScript("https://cdn.jsdelivr.net/npm/ag-psd@30.2.0/dist/bundle.js", "agPsd"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip")
    ]);
    await readyToExport();
    const L = current, S = state.settings;

    /* Cria uma camada: desenha o elemento num canvas do tamanho da
       caixa bx e posiciona em (x + dx, y + dy) no documento. */
    const layer = (name, e, bx, dx, dy) => {
      const x = Math.floor(bx.x), y = Math.floor(bx.y);
      const w = Math.max(1, Math.ceil(bx.x + bx.w) - x), h = Math.max(1, Math.ceil(bx.y + bx.h) - y);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      drawEl(c.getContext("2d"), e, S, x, y);
      return { name, left: x + dx, top: y + dy, canvas: c };
    };

    /* Todas as camadas do rodapé, deslocadas por (dx, dy).
       Ordem do ag-psd: a primeira camada fica embaixo. */
    const layersAt = (dx, dy) => {
      const list = [layer("Fundo", { type: "bg", x: 0, y: 0, w: L.W, h: L.H }, { x: 0, y: 0, w: L.W, h: L.H }, dx, dy)];
      L.els.filter(e => e.type === "line").forEach((e, i) => list.push(layer("Linha " + (i + 1), e, e, dx, dy)));
      L.els.filter(e => e.type === "text").forEach(e => {
        const bx = { x: (e.align === "center" ? e.x - e.w / 2 : e.x) - 4, y: e.y - 2, w: e.w + 8, h: e.h + 4 };
        list.push(layer("Título – " + e.text, e, bx, dx, dy));
      });
      L.els.filter(e => e.type === "logo" && e.img).forEach(e => list.push(layer(e.name, e, e, dx, dy)));
      return list;
    };

    // Configuração de artboard (fundo transparente)
    const artboard = rect => ({ rect, guideIndices: [], presetName: "Custom", color: { r: 255, g: 255, b: 255 }, backgroundType: 3 });

    // Documento: rodapé à esquerda, 200 px de espaço, quadro de vídeo à direita
    const ax = L.W + 200, vp = vPos();
    const docW = ax + VW, docH = Math.max(L.H, VH);

    // Imagem composta (miniatura que o Photoshop mostra antes de abrir)
    const composite = document.createElement("canvas");
    composite.width = docW; composite.height = docH;
    const cctx = composite.getContext("2d");
    cctx.drawImage(exportCanvas(), 0, 0);
    const video = verticalCanvas();
    cctx.drawImage(video, ax, 0);

    const psd = {
      width: docW, height: docH, canvas: composite,
      children: [
        { name: "Rodapé " + L.W + "×" + L.H, opened: true,
          artboard: artboard({ top: 0, left: 0, bottom: L.H, right: L.W }),
          children: layersAt(0, 0) },
        { name: "Vídeo 1920×1080", opened: true,
          artboard: artboard({ top: 0, left: ax, bottom: VH, right: ax + VW }),
          children: layersAt(ax + vp.x, vp.y) }
      ]
    };
    const bytes = agPsd.writePsdUint8Array(psd, { generateThumbnail: true });

    // Compacta PSD + PNGs
    const zip = new JSZip(), name = "rodape-" + stamp();
    zip.file(name + ".psd", bytes);
    zip.file(name + ".png", await new Promise(r => exportCanvas().toBlob(r, "image/png")));
    zip.file(name + "-1920x1080.png", await new Promise(r => video.toBlob(r, "image/png")));
    await saveBlob(await zip.generateAsync({ type: "blob" }), name + ".zip");
  } catch (e) {
    console.error(e);
    toast("Não foi possível gerar o PSD. Verifique a conexão e tente de novo.", 4000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});


/* =====================================================================
   11. MANIFESTO (logos.json) E LOGOS LOCAIS
   ---------------------------------------------------------------------
   • Logos para TODOS: ficam no repositório (pasta logos/ + logos.json).
     Só o administrador altera, pelo GitHub (ver tutorial).
   • Logos enviados pelo site: ficam salvos só no navegador de quem
     enviou (localStorage). Servem para uso pontual ou para o
     administrador preparar o PNG tratado antes de subir no GitHub.
   ===================================================================== */
const LOCAL_KEY = "rodape-logos-locais-v1";
const canWrite = true;   // no site estático qualquer pessoa pode enviar logos locais

/* Arquivos publicados pelo administrador nesta sessão: enquanto o
   GitHub Pages não republica (1–2 min), a imagem vem daqui. */
const pendingSrc = {};

/* Monta as listas de logos e templates a partir do conteúdo do logos.json */
function applyManifest(m) {
  const gid = n => "g_" + slug(n).replace(/-/g, "");
  const fid = n => "f_" + slug(n);
  const file = (folder, a) => pendingSrc[folder + "/" + a] || ("logos/" + folder + "/" + encodeURIComponent(a));

  GROUP_LOGOS = (m.grupo || [])
    .filter(x => x && x.nome && x.arquivo)
    .map(x => ({ id: gid(x.nome), name: x.nome, src: file("grupo", x.arquivo) }));

  PHARMA_LOGOS = (m.farmaceuticas || [])
    .filter(x => x && x.nome)
    .map(x => ({ id: fid(x.nome), name: x.nome, src: x.arquivo ? file("farmaceuticas", x.arquivo) : null }));

  // Templates referenciam os logos pelo NOME (sem diferenciar acento/maiúscula)
  const byName = new Map([...GROUP_LOGOS, ...PHARMA_LOGOS].map(l => [slug(l.name), l.id]));
  TEMPLATES = (m.templates || [])
    .map(t => ({ name: t.nome, logos: (t.realizacao || []).map(n => byName.get(slug(n))).filter(Boolean) }))
    .filter(t => t.name && t.logos.length);
}

/* Lê o logos.json publicado no site */
async function loadManifest() {
  if (location.protocol === "file:") {
    $("status").textContent = "Abra o site por um endereço http (GitHub Pages ou servidor local). Aberto como arquivo, os logos não carregam.";
    return;
  }
  try {
    // cache "no-cache": sempre confere se o logos.json mudou
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const m = await res.json();
    applyManifest(m);

    $("status").textContent = "Logos enviados por aqui ficam salvos só neste navegador. Para liberar para todos, o administrador adiciona no GitHub.";
  } catch (e) {
    console.error(e);
    $("status").textContent = "Não foi possível ler logos/logos.json. Confira se o arquivo existe e se o JSON está válido (vírgulas e aspas).";
    toast("Erro ao carregar a lista de logos.", 5000);
  }
}

/* Logos locais (localStorage do navegador) */
function loadLocalLogos() {
  try { localLogos = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch (e) { localLogos = []; }
}
function saveLocalLogos() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(localLogos)); return true; } catch (e) { return false; }
}

/* Exclui um logo local e o retira das seções.
   Em vaga de farmacêutica (id "f_..."), a vaga continua existindo. */
function deleteLogo(l) {
  localLogos = localLogos.filter(d => d.id !== l.id);
  saveLocalLogos();
  rebuildLib();
  renderLib();
  state.sections.forEach(s => s.logos = s.logos.filter(it => it.ref !== l.id || l.id.startsWith("f_")));
  changed(true);
  toast("Logo “" + l.name + "” excluído deste navegador.");
}


/* =====================================================================
   12. ENVIO DE LOGO
   ===================================================================== */
const dlg = $("dlg");
let upCtx = null;      // { slot?: id da vaga, group?: categoria, name?: nome sugerido, file?: arquivo }
let upBlob = null;     // PNG já tratado, pronto para salvar
let upPreviewUrl = null;

/* Abre a janela.
   opts.slot  = vaga de farmacêutica sendo preenchida (categoria fixa)
   opts.group = categoria pré-selecionada ("grupo" ou "farma") */
function openUpload(opts = {}) {
  upCtx = opts;
  upBlob = null;
  $("upName").value = opts.name || "";
  $("upGroup").value = opts.group || "farma";
  $("upGroupField").hidden = !!opts.slot;
  $("upPrev").hidden = true;
  $("upSave").disabled = $("upDownload").disabled = true;
  $("upNote").textContent = "";
  $("dlgTitle").textContent = opts.replace ? ("Trocar logo – " + opts.replace.name)
    : opts.slot ? ((admin.on ? "Publicar logo – " : "Enviar logo – ") + opts.name)
    : (admin.on ? "Publicar logo" : "Enviar logo");
  // No modo administrador o botão publica no GitHub em vez de salvar localmente
  $("upGroupField").hidden = !!(opts.slot || opts.replace);
  $("upSave").textContent = admin.on ? "Publicar para todos" : "Salvar logo";
  $("upLocalNote").textContent = admin.on
    ? "Modo administrador: o logo será publicado no GitHub e aparece para todos em 1 a 2 minutos."
    : "O logo fica salvo só neste navegador. Para disponibilizar para todos, entre na Área do administrador.";
  $("upFile").value = "";
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}
function closeUpload() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }

$("upCancel").addEventListener("click", closeUpload);
$("upX").addEventListener("click", closeUpload);

// Área de soltar arquivo (clique, teclado ou arrastar)
const dropFile = $("dropFile");
dropFile.addEventListener("click", () => $("upFile").click());
dropFile.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("upFile").click(); } });
dropFile.addEventListener("dragover", e => { e.preventDefault(); dropFile.classList.add("over"); });
dropFile.addEventListener("dragleave", () => dropFile.classList.remove("over"));
dropFile.addEventListener("drop", e => {
  e.preventDefault();
  dropFile.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (f) takeFile(f);
});
$("upFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) takeFile(f); });

// Ligar/desligar a remoção de fundo reprocessa o mesmo arquivo
$("upKey").addEventListener("change", () => { if (upCtx && upCtx.file) takeFile(upCtx.file); });

/* Trata o arquivo escolhido:
   1. limita o tamanho a 1200 px (SVG é ampliado até 4× para ficar nítido)
   2. (opcional) remove o fundo branco: pixels quase brancos ficam
      transparentes, com transição suave nas bordas
   3. recorta as margens transparentes
   4. gera um PNG e mostra a prévia */
async function takeFile(f) {
  if (!/^image\//.test(f.type) && !/\.(png|jpe?g|svg|webp)$/i.test(f.name)) {
    $("upNote").textContent = "Formato não suportado. Use PNG, JPG, SVG ou WEBP.";
    return;
  }
  upCtx.file = f;

  // Sugere o nome a partir do arquivo, se o campo estiver vazio
  if (!$("upName").value.trim()) {
    $("upName").value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  }

  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

    // 1. Tamanho de trabalho
    const isSvg = /svg/.test(f.type);
    let w = img.naturalWidth || 1000, h = img.naturalHeight || 500;
    const fit = 1200 / Math.max(w, h);
    if (fit < 1 || isSvg) {
      const s = isSvg ? Math.min(fit, 4) : fit;
      w = Math.round(w * s); h = Math.round(h * s);
    }
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h), d = data.data;

    // 2. Remoção do fundo branco (canal mais escuro > 215 começa a sumir;
    //    > 250 fica 100% transparente). A cor é “despremultiplicada”
    //    para não deixar halo branco nas bordas.
    if ($("upKey").checked) {
      for (let i = 0; i < d.length; i += 4) {
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (mn > 215) {
          const a = Math.max(0, Math.min(1, (250 - mn) / 35));
          const original = d[i + 3] / 255;
          if (a > 0 && a < 1) for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, (d[i + k] - 255 * (1 - a)) / a));
          d[i + 3] = Math.round(255 * a * original);
        }
      }
    }

    // 3. Caixa delimitadora dos pixels visíveis
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) {
      $("upNote").textContent = "A imagem ficou vazia. Desmarque “Remover fundo branco” se o logo for branco.";
      upBlob = null; $("upSave").disabled = $("upDownload").disabled = true;
      return;
    }
    ctx.putImageData(data, 0, 0);

    // 4. Recorte + PNG + prévia
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    upBlob = await new Promise(r => out.toBlob(r, "image/png"));
    if (upPreviewUrl) URL.revokeObjectURL(upPreviewUrl);
    upPreviewUrl = URL.createObjectURL(upBlob);
    $("upImg").src = upPreviewUrl;
    $("upPrev").hidden = false;
    $("upSave").disabled = $("upDownload").disabled = false;
    $("upNote").textContent = "";
  } catch (e) {
    $("upNote").textContent = "Não foi possível ler essa imagem.";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Converte arquivo em texto base64 (data URL) */
const blobToDataUrl = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

/* Reduz a largura de um PNG (usado quando o logo vai direto no banco) */
async function shrinkBlob(blob, maxW) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxW / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, "image/png"));
}

/* Salvar logo: guarda o PNG tratado neste navegador (localStorage).
   Se o arquivo for grande, reduz a largura para caber no armazenamento. */
$("upSave").addEventListener("click", async () => {
  const name = $("upName").value.trim();
  if (!name) { $("upNote").textContent = "Dê um nome ao logo para encontrá-lo depois."; $("upName").focus(); return; }
  if (!upBlob) return;
  if (admin.on) { adminSaveFromDialog(); return; }   // publica para todos (seção 15)

  const btn = $("upSave");
  btn.disabled = true; btn.textContent = "Salvando…";
  const docId = upCtx.slot || ("l_" + slug(name).slice(0, 40) + "-" + uid());
  const group = upCtx.slot ? "farma" : $("upGroup").value;
  try {
    let b = upBlob, url = await blobToDataUrl(b);
    for (const w of [700, 500, 360]) { if (url.length < 350000) break; b = await shrinkBlob(upBlob, w); url = await blobToDataUrl(b); }
    localLogos = localLogos.filter(d => d.id !== docId);
    localLogos.push({ id: docId, name, group, dataUrl: url });
    const ok = saveLocalLogos();
    rebuildLib(); renderLib(); renderSecs(); scheduleRender();
    toast(ok
      ? "Logo “" + name + "” salvo neste navegador."
      : "Logo adicionado até recarregar a página (armazenamento do navegador cheio).", 4000);
    closeUpload();
  } catch (e) {
    $("upNote").textContent = "Não foi possível salvar. Tente de novo.";
  } finally {
    btn.disabled = false; btn.textContent = "Salvar logo";
  }
});

/* Botão do administrador: baixa o PNG já tratado (fundo removido e
   margens recortadas) com o nome pronto para colocar no repositório. */
$("upDownload").addEventListener("click", () => {
  if (!upBlob) return;
  const name = $("upName").value.trim() || "logo";
  saveBlob(upBlob, slug(name) + ".png");
});


/* =====================================================================
   13. ABAS DO PAINEL LATERAL
   Mostra um painel e esconde o outro; mantém as duas barras de abas
   com o mesmo estado e devolve o foco para a aba clicada.
   ===================================================================== */
function showPane(p) {
  $("paneLib").hidden = p !== "lib";
  $("paneSet").hidden = p !== "set";
  document.querySelectorAll(".ptabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.pane === p ? "true" : "false"));
}
document.querySelectorAll(".ptabs button").forEach(b => b.addEventListener("click", () => {
  showPane(b.dataset.pane);
  const pane = b.dataset.pane === "lib" ? "#paneLib" : "#paneSet";
  const target = document.querySelector(pane + ' .ptabs button[data-pane="' + b.dataset.pane + '"]');
  if (target) target.focus();
}));


/* =====================================================================
   14. TEMPLATES BÁSICOS
   Cada template (definido no logos.json) preenche a seção “Realização”. Ao aplicar:
   substitui o conteúdo da Realização (cria a seção se não existir) e
   seleciona a próxima seção. O botão em uso fica destacado.
   ===================================================================== */
/* A lista TEMPLATES vem do logos.json (seção 11). */

/* Encontra a seção “Realização” (ignorando acento e maiúsculas) */
function realizacao() {
  let s = state.sections.find(x => slug(x.title || "").includes("realiza"));
  if (!s) {
    s = { id: "s" + uid(), title: "Realização", logos: [] };
    state.sections.unshift(s);
  }
  return s;
}

function applyTemplate(t) {
  const s = realizacao();
  s.logos = t.logos.map(ref => ({ ref, scale: 1 }));
  const next = state.sections.find(x => x !== s);
  state.active = (next || s).id;
  changed(true);
  toast("Template “" + t.name + "” aplicado em “Realização”.", 2200);
}

/* Cria um botão por template. data-key guarda a lista de logos para
   saber qual template está em uso. */
function renderTemplates() {
  const bar = $("tplGrid");
  bar.textContent = "";
  TEMPLATES.forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tpl-btn";
    b.dataset.key = t.logos.join(",");
    b.textContent = t.name;
    b.title = "Realização: " + t.logos.map(id => (lib.get(id) || {}).name).join(" + ");
    b.addEventListener("click", () => applyTemplate(t));
    bar.append(b);
  });
  markTemplate();
}

/* Destaca o botão cujo conjunto de logos é igual ao da Realização */
function markTemplate() {
  const s = state.sections.find(x => slug(x.title || "").includes("realiza"));
  const cur = s ? s.logos.map(l => l.ref).join(",") : "";
  document.querySelectorAll(".tpl-btn").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.key === cur ? "true" : "false"));
}


/* =====================================================================
   15. ÁREA DO ADMINISTRADOR (publicação via GitHub)
   ---------------------------------------------------------------------
   O repositório do GitHub é o “banco de logos”. Quem tem uma chave
   (token) com permissão de escrita no repositório pode, pelo próprio
   site, publicar, trocar e remover logos para todos.

   Como funciona cada publicação:
     1. lê o logos.json atual direto do repositório (versão mais nova)
     2. aplica a mudança (incluir, trocar ou remover a linha do logo)
     3. cria UM commit com o PNG + o logos.json atualizado
     4. o GitHub Pages republica o site em 1–2 minutos

   A chave fica só no navegador do administrador (localStorage, ou
   sessionStorage se “Lembrar neste navegador” estiver desmarcado).
   Nunca coloque a chave dentro dos arquivos do site.
   ===================================================================== */
const ADMIN_KEY = "rodape-admin-v1";
const MANIFEST_PATH = "logos/logos.json";
const admin = { on: false, repo: "", branch: "main", token: "", login: "" };

/* No GitHub Pages, descobre “usuario/repositorio” pelo endereço do site */
function guessRepo() {
  const h = location.hostname;
  if (!h.endsWith(".github.io")) return "";
  const owner = h.split(".")[0];
  const first = location.pathname.split("/").filter(Boolean)[0];
  return owner + "/" + (first || h);
}

function loadAdmin() {
  let raw = null;
  try { raw = localStorage.getItem(ADMIN_KEY) || sessionStorage.getItem(ADMIN_KEY); } catch (e) {}
  if (raw) { try { Object.assign(admin, JSON.parse(raw)); } catch (e) {} }
  admin.on = false;   // só liga depois de verificar a chave
}
function storeAdmin(remember) {
  const data = JSON.stringify({ repo: admin.repo, branch: admin.branch, token: admin.token, login: admin.login });
  try {
    localStorage.removeItem(ADMIN_KEY); sessionStorage.removeItem(ADMIN_KEY);
    (remember ? localStorage : sessionStorage).setItem(ADMIN_KEY, data);
  } catch (e) {}
}
function forgetAdmin() {
  try { localStorage.removeItem(ADMIN_KEY); sessionStorage.removeItem(ADMIN_KEY); } catch (e) {}
  Object.assign(admin, { on: false, token: "", login: "" });
}

/* Chamada à API do GitHub com a chave do administrador */
async function gh(path, opts = {}) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + admin.token,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch("https://api.github.com" + path, { ...opts, headers, cache: "no-store" });
  if (!res.ok) {
    const err = new Error("GitHub " + res.status);
    err.status = res.status;
    try { err.body = await res.json(); } catch (e) {}
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/* Mensagem amigável para cada tipo de erro */
function ghError(e) {
  if (e && e.msg) return e.msg;
  if (!e || !e.status) return "Sem conexão com o GitHub. Verifique a internet e tente de novo.";
  if (e.status === 401) return "Chave inválida ou expirada. Gere uma nova chave no GitHub.";
  if (e.status === 403) return "O GitHub recusou a gravação. Confira se a chave tem “Contents: Read and write” e se não expirou" + ((e.body && e.body.message) ? " (GitHub: “" + e.body.message + "”)" : "") + ".";
  if (e.status === 404) return "Repositório, branch ou arquivo não encontrado. Saia do modo administrador e conecte de novo para refazer o diagnóstico.";
  return "O GitHub recusou a operação (erro " + e.status + "). Tente de novo em instantes.";
}

/* Confere a chave e liga o modo administrador.
   Faz um diagnóstico em 4 etapas para dizer exatamente o que corrigir:
     1. a chave é válida?                       (GET /user)
     2. a chave enxerga o repositório?          (GET /repos/…)
     3. a branch existe?                        (GET /git/ref/heads/…)
     4. a chave pode gravar (Contents: write)?  (cria um blob de teste,
        que não altera nenhum arquivo e é descartado pelo GitHub) */
async function verifyAdmin() {
  const why = e => (e && e.body && e.body.message) ? " (GitHub: “" + e.body.message + "”)" : "";

  // 1. Chave válida
  try {
    const u = await gh("/user");
    admin.login = u.login || "";
  } catch (e) {
    if (e.status === 401) throw { msg: "Chave inválida ou expirada. Copie a chave completa (começa com github_pat_) ou gere uma nova." };
    if (!e.status) throw e;
    // fine-grained tokens podem não ler /user; segue para as próximas etapas
  }

  // 2. Repositório visível para a chave
  let r;
  try {
    r = await gh("/repos/" + admin.repo);
  } catch (e) {
    if (e.status === 404) throw { msg:
      "A chave não enxerga o repositório “" + admin.repo + "”. Confira: " +
      "(1) o nome exato no formato usuario/repositorio; " +
      "(2) na chave, “Repository access” → “Only select repositories” inclui este repositório; " +
      "(3) “Resource owner” da chave é a mesma conta ou organização dona do repositório." };
    if (e.status === 403) throw { msg: "O GitHub bloqueou a chave neste repositório. Se ele pertence a uma organização, a chave pode estar aguardando aprovação de um administrador da organização" + why(e) + "." };
    throw e;
  }
  if (r.permissions && r.permissions.push === false) throw { msg: "Sua conta do GitHub só tem leitura neste repositório. O dono precisa adicioná-la em Settings → Collaborators." };

  // 3. Branch
  try {
    await gh("/repos/" + admin.repo + "/git/ref/heads/" + encodeURIComponent(admin.branch));
  } catch (e) {
    if (e.status === 404) {
      if (r.default_branch && r.default_branch !== admin.branch) {
        admin.branch = r.default_branch;   // usa a branch principal do repositório
      } else throw { msg: "A branch “" + admin.branch + "” não existe neste repositório." };
    } else throw e;
  }

  // 4. Permissão de escrita (Contents: Read and write)
  try {
    await gh("/repos/" + admin.repo + "/git/blobs", { method: "POST", body: JSON.stringify({ content: "teste", encoding: "utf-8" }) });
  } catch (e) {
    if (e.status === 403 || e.status === 404) throw { msg:
      "A chave enxerga o repositório, mas não pode gravar. Edite a chave no GitHub (Settings → Developer settings → " +
      "Fine-grained tokens → sua chave → Edit) e, em “Repository permissions”, mude “Contents” para “Read and write”. " +
      "Depois clique em “Update” e conecte de novo" + why(e) + "." };
    throw e;
  }

  admin.on = true;
  refreshAdminUI();
  renderLib();
}

/* Lê o logos.json direto do repositório (sem esperar o Pages) */
async function readRepoManifest() {
  const d = await gh("/repos/" + admin.repo + "/contents/" + MANIFEST_PATH + "?ref=" + encodeURIComponent(admin.branch));
  const bin = atob(d.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* Escreve o logos.json no mesmo formato legível: um item por linha */
function serializeManifest(m) {
  const item = x => "{" + Object.entries(x).map(([k, v]) =>
    JSON.stringify(k) + ": " + (Array.isArray(v) ? "[" + v.map(s => JSON.stringify(s)).join(", ") + "]" : JSON.stringify(v))
  ).join(", ") + "}";
  const keys = ["grupo", "farmaceuticas", "templates", ...Object.keys(m).filter(k => !["grupo", "farmaceuticas", "templates"].includes(k))];
  const parts = keys.map(k => Array.isArray(m[k])
    ? "  " + JSON.stringify(k) + ": [\n" + m[k].map(x => "    " + item(x)).join(",\n") + "\n  ]"
    : "  " + JSON.stringify(k) + ": " + JSON.stringify(m[k]));
  return "{\n" + parts.join(",\n\n") + "\n}\n";
}

/* Cria UM commit com vários arquivos (Git Data API).
   files: [{ path, base64 } | { path, text } | { path, delete: true }] */
async function commitFiles(message, files) {
  const R = "/repos/" + admin.repo + "/git";
  const ref = await gh(R + "/ref/heads/" + encodeURIComponent(admin.branch));
  const baseSha = ref.object.sha;
  const base = await gh(R + "/commits/" + baseSha);
  const tree = [];
  for (const f of files) {
    if (f.delete) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
    const blob = await gh(R + "/blobs", { method: "POST", body: JSON.stringify(
      f.base64 ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" }) });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await gh(R + "/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
  const commit = await gh(R + "/commits", { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }) });
  await gh(R + "/refs/heads/" + encodeURIComponent(admin.branch), { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
}

/* Publica uma mudança. build(m) altera o manifesto m e devolve os
   arquivos extras do commit. Se outra pessoa publicou ao mesmo tempo
   (409/422), lê de novo e tenta outra vez; na última tentativa ignora
   apagar arquivos antigos (caso já tenham sido apagados à mão). */
async function publish(message, build) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const m = await readRepoManifest();
    const plan = build(m);
    const files = plan.files.filter(f => !(attempt === 2 && f.delete));
    try {
      await commitFiles(message, [...files, { path: MANIFEST_PATH, text: serializeManifest(m) }]);
      applyManifest(m);
      rebuildLib(); renderTemplates(); renderLib(); renderSecs(); scheduleRender();
      return;
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 2) continue;
      throw e;
    }
  }
}

/* Nome do arquivo: nome-do-logo.png. Na troca, ganha data e hora no
   nome para que nenhum navegador continue mostrando a imagem antiga. */
function pickFilename(name, list, replacing) {
  const base = slug(name) || "logo";
  const used = new Set(list.map(x => x.arquivo));
  let fn = base + ".png";
  if (replacing || used.has(fn)) fn = base + "-" + stamp() + ".png";
  for (let i = 2; used.has(fn); i++) fn = base + "-" + stamp() + "-" + i + ".png";
  return fn;
}

/* Publicar a partir da janela de envio (novo logo, vaga ou troca) */
async function adminSaveFromDialog() {
  const name = $("upName").value.trim();
  const rep = upCtx.replace;
  const group = rep ? rep.group : upCtx.slot ? "farma" : $("upGroup").value;
  const folder = group === "grupo" ? "grupo" : "farmaceuticas";
  const btn = $("upSave");
  btn.disabled = true; btn.textContent = "Publicando…";
  try {
    const b64 = (await blobToDataUrl(upBlob)).split(",")[1];
    await publish((rep ? "Troca de logo: " : "Novo logo: ") + name, m => {
      const list = m[folder] = m[folder] || [];
      const oldName = rep ? rep.name : upCtx.slot ? upCtx.name : name;
      const entry = list.find(x => slug(x.nome || "") === slug(oldName));
      if (!rep && !upCtx.slot && entry && entry.arquivo) throw { msg: "Já existe um logo com esse nome. Use “Trocar” no logo existente." };
      const files = [];
      const fn = pickFilename(name, list, !!(entry && entry.arquivo));
      if (entry && entry.arquivo) files.push({ path: "logos/" + folder + "/" + entry.arquivo, delete: true });
      files.push({ path: "logos/" + folder + "/" + fn, base64: b64 });
      if (entry) {
        // Nome mudou na troca: atualiza também os templates que usam o logo
        if (slug(entry.nome) !== slug(name)) {
          (m.templates || []).forEach(t => t.realizacao = (t.realizacao || []).map(n => slug(n) === slug(entry.nome) ? name : n));
        }
        entry.nome = name; entry.arquivo = fn;
      } else {
        list.push({ nome: name, arquivo: fn });
      }
      pendingSrc[folder + "/" + fn] = "data:image/png;base64," + b64;
      return { files };
    });
    // Um logo local com o mesmo id deixaria de mostrar o publicado
    if (upCtx.slot) { localLogos = localLogos.filter(d => d.id !== upCtx.slot); saveLocalLogos(); rebuildLib(); renderLib(); }
    closeUpload();
    toast("“" + name + "” publicado. Aparece para todos em 1 a 2 minutos.", 5000);
  } catch (e) {
    console.error(e);
    $("upNote").textContent = ghError(e);
  } finally {
    btn.disabled = false; btn.textContent = "Publicar para todos";
  }
}

/* Remover um logo para todos */
async function adminRemove(l) {
  const folder = l.group === "grupo" ? "grupo" : "farmaceuticas";
  toast("Removendo “" + l.name + "”…", 10000);
  try {
    await publish("Remoção de logo: " + l.name, m => {
      const list = m[folder] || [];
      const i = list.findIndex(x => slug(x.nome || "") === slug(l.name));
      if (i < 0) return { files: [] };
      const old = list.splice(i, 1)[0];
      return { files: old.arquivo ? [{ path: "logos/" + folder + "/" + old.arquivo, delete: true }] : [] };
    });
    toast("“" + l.name + "” removido. Some para todos em 1 a 2 minutos.", 5000);
  } catch (e) {
    console.error(e);
    toast(ghError(e), 7000);
  }
}

/* Interface: faixa “Modo administrador”, botão de acesso e janela */
function refreshAdminUI() {
  $("adminBar").hidden = !admin.on;
  $("adminBtn").hidden = admin.on;
  if (admin.on) $("adminWho").textContent = (admin.login ? "@" + admin.login + " · " : "") + admin.repo;
}
const admDlg = $("admDlg");
const closeAdm = () => { if (admDlg.close) admDlg.close(); else admDlg.removeAttribute("open"); };
$("adminBtn").addEventListener("click", () => {
  $("admRepo").value = admin.repo || guessRepo();
  $("admBranch").value = admin.branch || "main";
  $("admToken").value = admin.token || "";
  $("admNote").textContent = "";
  if (admDlg.showModal) admDlg.showModal(); else admDlg.setAttribute("open", "");
});
$("admCancel").addEventListener("click", closeAdm);
$("admX").addEventListener("click", closeAdm);
$("admConnect").addEventListener("click", async () => {
  admin.repo = $("admRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  admin.branch = $("admBranch").value.trim() || "main";
  admin.token = $("admToken").value.trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(admin.repo)) { $("admNote").textContent = "Informe o repositório no formato usuario/repositorio."; return; }
  if (!admin.token) { $("admNote").textContent = "Cole a chave (token) do GitHub."; return; }
  const btn = $("admConnect");
  btn.disabled = true; btn.textContent = "Conectando…";
  try {
    await verifyAdmin();
    storeAdmin($("admRemember").checked);
    closeAdm();
    toast("Modo administrador ativado.", 3000);
  } catch (e) {
    admin.on = false; refreshAdminUI();
    $("admNote").textContent = ghError(e);
  } finally {
    btn.disabled = false; btn.textContent = "Conectar";
  }
});
$("adminOut").addEventListener("click", () => {
  forgetAdmin(); refreshAdminUI(); renderLib();
  toast("Você saiu do modo administrador e a chave foi apagada deste navegador.", 4000);
});


/* =====================================================================
   16. INICIALIZAÇÃO
   Ajustes e seções aparecem na hora; a biblioteca e os templates
   aparecem assim que o logos.json termina de carregar.
   ===================================================================== */
loadAdmin();
refreshAdminUI();
syncSettingsUI();
loadLocalLogos();
rebuildLib();
renderLib();
renderSecs();
loadWeight();
scheduleRender();
loadManifest().then(() => {
  rebuildLib();
  renderTemplates();
  renderLib();
  renderSecs();
  scheduleRender();
  // Chave salva? Confere em silêncio e reativa o modo administrador
  if (admin.token && admin.repo) verifyAdmin().catch(() => { admin.on = false; refreshAdminUI(); });
});
