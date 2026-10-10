# Arquitetura do Kortin (v0.4)

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

## Testes

| Camada | Comando | O quê |
|---|---|---|
| Unidade + propriedade | `npm run test:unit` | timeline, legendas, reducer, validadores (fuzz), parseProbe, Range, ASS, migração |
| Integração | `npm run test:engine` | exportação real com FFmpeg: formatos, áudio, legendas, 160 clipes, Unicode, cancelamento |
| IA | `npm run test:whisper` | whisper.cpp real com modelo tiny |
| Interface | `npx electron tests/screenshot.js editar\|legenda\|recuperar <pasta>` | roteiro na UI + prints |
