# Gerador de rodapé de logos

Site estático para montar rodapés de logos (Realização, Patrocínio, Apoio educacional) e baixar em PNG transparente, quadro 1920 × 1080 e PSD com artboards.

## Estrutura

```
index.html                  página
style.css                   visual
script.js                   funcionamento
logos/logos.json            lista de logos e templates (editar aqui)
logos/grupo/                PNGs dos logos do grupo
logos/farmaceuticas/        PNGs dos logos das farmacêuticas
```

## Publicar no GitHub Pages

1. Envie todos os arquivos para a raiz de um repositório público.
2. Em **Settings → Pages → Build and deployment**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e clique em **Save**.
3. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Área do administrador

O administrador publica, troca e remove logos pelo próprio site, em **Área do administrador** (rodapé da biblioteca), usando uma chave do GitHub (fine-grained token) com permissão **Contents: Read and write** só neste repositório. Cada publicação vira um commit com o PNG e o `logos.json` atualizado. A chave fica salva apenas no navegador do administrador.

## Adicionar um logo manualmente

1. Coloque o PNG (fundo transparente, nome sem acentos e sem espaços) em `logos/farmaceuticas/` ou `logos/grupo/`.
2. Em `logos/logos.json`, inclua uma linha na lista certa:

```json
{"nome": "Novo Laboratório", "arquivo": "novo-laboratorio.png"},
```

Cada item é separado por vírgula; o último item da lista não leva vírgula.
Para uma vaga sem logo ainda, use `"arquivo": ""`.

## Templates

No bloco `"templates"` do `logos.json`, cada template lista os logos da seção Realização pelo nome:

```json
{"nome": "Hemomeeting", "realizacao": ["Hemomeeting", "TribeMD"]}
```

## Testar no computador

O site precisa ser aberto por um endereço `http` (não com duplo clique). Na pasta do projeto:

```
python -m http.server
```

e abra `http://localhost:8000`.
