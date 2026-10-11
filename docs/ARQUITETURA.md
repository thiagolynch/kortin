# Arquitetura do Kortin (v0.7)

## Fronteiras

```
┌──────────── renderer (NÃO confiável, sandbox + CSP) ────────────┐
│ App.jsx (composição)                                            │
│  ├─ state/document.js   documento + desfazer (reducer imutável) │
│  ├─ state/playhead.js   cursor fora do React (60 fps isolado)   │
│  ├─ hooks/              projeto, mídia, fila, atalhos           │
│  ├─ lib/                funções puras (timeline, legendas)      │
│  └─ components/         UI; só assina o que lê                  │
└───────────────┬─────────────────────────────────────────────────┘
                │ preload.js (API mínima, sem Node)
┌───────────────▼──────────── main (confiável) ───────────────────┐
│ ipc/*        valida TUDO (core/security.js) antes de agir       │
│ core/        security (Grants, validadores), logger             │
│ services/    ffmpeg/ (probe, waveform, filtergraph, exporter),  │
│              stt/ (whisper), captions/ (ASS), projectStore,     │
│              highlights/ (melhores momentos, só onda sonora),   │
│              mediaProtocol (media:// com Range), tempCleanup    │
│ window.js    endurecimento (navegação, permissões, webview)     │
└─────────────────────────────────────────────────────────────────┘
shared/constants.json — limites e listas usados pelos dois lados
```

## Regras

1. **Renderer não escolhe caminhos.** Só abre/grava o que o usuário escolheu em diálogo, arrastou ou abriu pelo Windows (`Grants`). Caminhos de rede (`\\servidor`) são recusados.
2. **Nada do renderer entra cru no FFmpeg.** Números são validados como `number` finito dentro de limites; opções vêm de listas fechadas (`validateExportJob`).
3. **Todo estado salvo passa pelo reducer.** `commit` = 1 passo de desfazer; `begin/preview/end` = arrasto inteiro vira 1 passo.
4. **O cursor não re-renderiza a árvore.** Componentes leem com `usePlayhead(store, seletor)` e o seletor devolve primitivo.
5. **Exportação com memória limitada.** Acima de 16 clipes, renderiza em partes e emenda (concat demuxer). Durações são arredondadas em quadros na timeline inteira (sem deriva de legenda).
6. **Gravação atômica.** Projeto e vídeo vão para arquivo temporário e só são renomeados no fim.
7. **Projetos portáteis.** O `.kortin` guarda caminho absoluto + relativo de cada vídeo. Ao abrir: absoluto → relativo → mesmo nome na pasta do projeto → diálogo "Arquivos não encontrados" (localizar ou procurar numa pasta, busca limitada).
8. **Cache em disco** (`services/mediaCache.js`): leitura, miniatura e onda sonora por caminho+tamanho+data, LRU de 200 MB.
9. **Modelos de IA íntegros.** URL em revisão fixa do Hugging Face + tamanho e SHA-256 no código; conferido no download e antes do primeiro uso; o CI confere os hashes contra o servidor (`npm run verify:models`).
10. **Cortes sugeridos são dados, não ações.** `suggestCuts` (puro) lista pausas, vícios e frases reiniciadas com motivo, tempo no arquivo e posição na timeline; a decisão (aceito/rejeitado) fica na interface por id estável; `applyCuts` aplica só os aceitos, num único passo de desfazer.
11. **Música com abaixamento pela própria voz.** Na exportação, a voz alimenta um `sidechaincompress` na música (−12 dB, ataque 20 ms, retorno 400 ms), seguido de `alimiter`. A música entra com `-stream_loop -1` e é cortada no total; na exportação em partes, só no passo final (sem emendas). A prévia aproxima o abaixamento pelos clipes com som.

12. **HDR vira SDR na exportação.** Vídeo HDR (bt2020 + PQ/HLG, comum em iPhone/Android recentes, inclusive Dolby Vision) é detectado no `probe` (`services/ffmpeg/probe.js`) e passa por `zscale`+`tonemap=hable` antes do resto da cadeia (`services/ffmpeg/filtergraph.js` → `HDR_TONEMAP`), senão a cor sai esmaecida no MP4 SDR final. A prévia no navegador não passa por esse filtro (o `<video>` mostra o HDR como o sistema operacional decidir); só a exportação é garantida.
13. **Prévia = exportação.** Cor: a mesma matriz 3×3 (`shared/constants.json` → `FILTERS`) vira `feColorMatrix` em sRGB na prévia e `colorchannelmixer` no FFmpeg. Texto: o tamanho do `.ass` é convertido para CSS dividindo por `ASS_FONT_EM` (1,562 para a Montserrat: a libass usa win ascent + descent); a altura de linha da prévia também é 1,562. Títulos: as linhas são quebradas uma vez (`lib/titles.js`) e a mesma lista vai para a prévia e para o `.ass`.
14. **Transição não muda o tempo.** O fade pelo preto acontece dentro do clipe (filtro `fade` depois do `trim`), então a legenda, os cortes sugeridos e a música não precisam ser recalculados.

## Testes

| Camada | Comando | O quê |
|---|---|---|
| Unidade + propriedade | `npm run test:unit` | timeline, legendas, cortes sugeridos, música, reducer, validadores (fuzz), parseProbe, Range, ASS, migração, cache, integridade |
| Integração | `npm run test:engine` | exportação real com FFmpeg: formatos, áudio, legendas, música com/sem abaixamento (medido por banda), 160 clipes, Unicode, cancelamento |
| IA | `npm run test:whisper` | whisper.cpp real com modelo tiny |
| Interface | `npx electron tests/screenshot.js editar\|legenda\|recuperar\|mover <pasta>` | roteiro na UI + prints |
| Modelos | `npm run verify:models` | SHA-256 fixados conferem com o Hugging Face |
