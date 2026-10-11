<div align="center">

<img src="build/icon.png" width="96" alt="Logo do Kortin" />

# Kortin

**O editor de vídeo sem pegadinhas, para quem produz vídeo curto.**<br/>
Sem anúncios, sem marca d'água, sem assinatura para salvar o seu próprio vídeo.<br/>
Legenda automática e cortes com IA processados **no seu computador** — seus vídeos não vão para a nuvem.

[![Última versão](https://img.shields.io/github/v/release/thiagolynch/kortin?label=vers%C3%A3o&color=22d3ee)](https://github.com/thiagolynch/kortin/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/thiagolynch/kortin/build-windows.yml?branch=main&label=build)](https://github.com/thiagolynch/kortin/actions)
![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4)
![Processamento local](https://img.shields.io/badge/IA-processamento%20local-a78bfa)

**[⬇️ Baixar o instalador para Windows](https://github.com/thiagolynch/kortin/releases/latest/download/Kortin-Instalador.exe)** · [versão portátil](https://github.com/thiagolynch/kortin/releases/latest/download/Kortin-Portatil.exe) · [Novidades](CHANGELOG.md) · [Arquitetura](docs/ARQUITETURA.md)

<img src="docs/img/editor.webp" alt="Editor do Kortin com linha do tempo, onda sonora e música de fundo" width="900" />

</div>

---

## Os compromissos do Kortin

- 🚫 **Nunca coloca marca d'água** no seu vídeo.
- 🆓 **Exportar é sempre grátis**, em qualquer formato e na qualidade máxima.
- 🔒 **Seus vídeos não saem do seu PC**: edição, legenda e cortes com IA rodam localmente.
- 📴 **Funciona offline** e sem limite de uso da legenda automática — sem créditos. Só o primeiro uso da legenda precisa de internet, para baixar o modelo de IA (de 148 a 574 MB, uma única vez).
- 🙅 **Sem cadastro** e sem anúncios.

## Recursos

### ✂️ Edição rápida
- Importar arrastando ou pelo botão (MP4, MOV, MKV, WEBM, AVI…)
- Linha do tempo com miniaturas, **onda sonora**, zoom (`Ctrl` + roda) e **ímã** que gruda nas emendas
- Cortar pelas alças, **dividir** (`S`), duplicar, excluir e reordenar arrastando
- **Velocidade** de 0,25x a 4x (o áudio acompanha sem mudar o tom), **volume até 200%** e fades
- **Desfazer/refazer de tudo** — cada arrasto vira um único passo
- Formatos **9:16, 16:9, 1:1 e 4:5** com fundo desfocado, preencher ou ajustar

### 🎨 Cor, transições e títulos
<img src="docs/img/titulos-e-cor.webp" alt="Título sobre o vídeo, filtros de cor e transição suave" width="760" />

- **6 cores prontas** por clipe — Natural, Quente, Frio, Vívido, Vintage e P&B — com "aplicar a todos"
- **Transição suave** (fade pelo preto) em cada clipe ou em **todas as emendas com um clique**, sem mudar a duração nem dessincronizar a legenda
- **Títulos** em 3 estilos (Título, Destaque, Rodapé), com **cor própria** (6 combinações prontas ou livre) e **entrada "Aparece" ou "Salta"**: texto livre por cima do vídeo, arrastável na linha do tempo
- **O que você vê é o que sai**: a prévia usa as mesmas matrizes de cor e o mesmo tamanho de fonte do vídeo exportado

### 💬 Legenda automática (IA no seu PC)
<img src="docs/img/legendas-e-cortes.webp" alt="Legendas com destaque palavra a palavra e revisão de cortes sugeridos" width="760" />

- Transcrição palavra por palavra em **português**, inglês e espanhol (whisper.cpp)
- 3 modelos — Rápido, Preciso e Máximo — baixados **uma vez**, com assinatura SHA-256 conferida
- Estilos **Clássica, Destaque** (palavra da vez colorida), **Caixa** e **Neon**; tamanho, altura e maiúsculas
- A legenda **acompanha os cortes** e é queimada no vídeo na exportação; texto editável

### 🤖 Cortes sugeridos — o Kortin sugere, você decide
- **Pausas** (com limite ajustável), **vícios** ("é", "ãh", "hum"; "né" e "tipo" opcionais) e **frases reiniciadas** ("hoje eu vou… hoje eu vou mostrar")
- Cada sugestão mostra **o motivo**, aparece **marcada na linha do tempo** e pode ser **ouvida** antes
- Aceite ou rejeite uma por uma (`A` / `R` / `O` para ouvir) e aplique tudo de uma vez — `Ctrl+Z` desfaz

### 🎵 Música de fundo com abaixamento automático
- Escolha ou arraste um MP3/WAV/M4A: ela **repete até o fim** do vídeo, com fade de entrada e saída
- **Abaixa sozinha quando alguém fala** (cerca de −12 dB) e volta nas pausas — sem desenhar curva de volume

### 📦 Exportação sem limites
<img src="docs/img/exportar.webp" alt="Exportação em vários formatos ao mesmo tempo" width="640" />

- **Vários formatos de uma vez** (ex.: Reels 9:16 + YouTube 16:9), em **segundo plano**
- **Placa de vídeo** NVIDIA, Intel ou AMD detectada sozinha; se falhar, refaz pelo processador
- Projetos grandes (centenas de clipes) exportados **em partes**, com memória sob controle
- MP4 H.264 + AAC em 1080p — **sem marca d'água**

### 🛟 Seu trabalho não se perde
<img src="docs/img/arquivos-nao-encontrados.webp" alt="Tela de arquivos não encontrados" width="640" />

- **Recuperação automática** enquanto você edita (queda de energia, travou, fechou sem querer)
- Projetos **portáteis**: mude a pasta de lugar ou abra em outro PC — o Kortin acha os vídeos; o que não achar, você localiza ou manda procurar numa pasta
- Atualização automática na versão instalada

## Baixar e instalar

1. Baixe a versão mais recente:
   - **[Kortin-Instalador.exe](https://github.com/thiagolynch/kortin/releases/latest/download/Kortin-Instalador.exe)** — instala e se atualiza sozinho (recomendado)
   - **[Kortin-Portatil.exe](https://github.com/thiagolynch/kortin/releases/latest/download/Kortin-Portatil.exe)** — roda sem instalar (não se atualiza sozinho)

   Versões anteriores e notas de cada uma: [Releases](https://github.com/thiagolynch/kortin/releases).
2. Na primeira vez que usar a legenda automática, o Kortin pede para baixar o modelo de IA (uma vez só, precisa de internet). Depois disso, tudo funciona offline.
3. O app ainda não tem certificado de assinatura, então o Windows pode mostrar *"O Windows protegeu o computador"*: clique em **Mais informações → Executar assim mesmo**.

**Requisitos:** Windows 10 ou 11 (64 bits). A legenda automática roda em qualquer processador; com processador recente, os modelos maiores ficam mais rápidos.

## Atalhos

| Tecla | Ação | Tecla | Ação |
|---|---|---|---|
| `Espaço` | Play / pausa | `Ctrl+Z` / `Ctrl+Y` | Desfazer / refazer |
| `S` | Dividir no cursor | `Ctrl+S` / `Ctrl+Shift+S` | Salvar / salvar como |
| `Delete` | Excluir clipe | `Ctrl+O` / `Ctrl+N` | Abrir / novo projeto |
| `Ctrl+D` | Duplicar clipe | `←` `→` | 1 quadro (`Shift`: 1 segundo) |
| `N` | Liga/desliga o ímã | `Alt` + arrastar | Sem ímã |
| `A` / `R` / `O` | Aceitar / rejeitar / ouvir corte sugerido | `Ctrl` + roda | Zoom na timeline |

## Privacidade e segurança

- **Seus vídeos não saem do seu computador**: vídeo, áudio e transcrições são processados localmente. A internet só é usada para baixar os modelos de IA (uma vez, quando você pede) e as atualizações do app.
- A interface roda isolada (sandbox, CSP, sem acesso direto ao sistema); o app só lê e grava arquivos que **você** escolheu, recusa caminhos de rede e valida tudo antes de chegar ao FFmpeg.
- Modelos de IA baixados de uma **versão fixa** e conferidos por **SHA-256**; arquivo adulterado é apagado.
- Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Roteiro

| Versão | Entrega | Status |
|---|---|---|
| 0.1–0.2 | Editor base, onda sonora, ímã, velocidade, fades, fila e vários formatos | ✅ |
| 0.3 | Legenda automática local | ✅ |
| 0.4 | Refatoração: segurança, desempenho e testes | ✅ |
| 0.5 | Projetos portáteis, cache, modelos verificados, licenças | ✅ |
| **0.6** | **Cortes sugeridos e música de fundo com abaixamento** | ✅ |
| 0.6.1 | Preparação do beta: diagnóstico do PC e link direto de download | ✅ |
| **0.7** | **Cores, transições e títulos** | ✅ |
| próximas | Beta fechado · fotos com zoom suave · licença e compra · marca própria (logo) e templates | 🔜 |

Histórico completo no [CHANGELOG](CHANGELOG.md).

---

## Para desenvolvedores

Pré-requisitos: [Node.js 22 LTS](https://nodejs.org) e [Git](https://git-scm.com). Para compilar a IA de legenda: CMake e, no Windows, Visual Studio Build Tools com C++.

```bash
npm install            # dependências (inclui FFmpeg e Electron)
npm run setup:whisper  # compila o whisper.cpp (uma vez)
npm run dev            # abre o Kortin em modo desenvolvimento
```

| Comando | O que faz |
|---|---|
| `npm test` | testes de unidade/propriedade + motor de vídeo |
| `npm run test:unit` | 88 testes (timeline, legendas, cortes, música, cor, títulos, segurança com fuzz, FFmpeg) |
| `npm run test:engine` | exporta vídeos reais e mede o resultado (formatos, áudio, legendas, música, cor, transição, títulos, 160 clipes) |
| `npm run test:whisper` | legenda de ponta a ponta com o modelo tiny |
| `npm run verify:models` | confere os SHA-256 dos modelos contra o servidor |
| `npx electron tests/screenshot.js editar\|legenda\|recuperar\|mover <pasta>` | roteiros na interface, com prints |
| `npm run dist` | gera o instalador em `release/` |

**Publicar uma versão:** aumente `"version"` no `package.json`, descreva a versão no [CHANGELOG](CHANGELOG.md) e envie para a `main`. O GitHub Actions testa no Windows, gera os `.exe` e publica em Releases com as notas do CHANGELOG — quem tem o app instalado recebe a atualização.

```
electron/        processo principal (confiável)
  core/          segurança (autorizações, validadores) e log
  ipc/           canais da interface: só validam e despacham
  services/      FFmpeg, legenda (whisper), projetos, cache, protocolo de mídia
src/             interface React (não confiável, isolada)
  state/         documento com desfazer + cursor fora do React
  hooks/         projeto, mídia, música, fila, atalhos
  lib/           regras puras: timeline, legendas, cortes sugeridos
  components/    telas
shared/          constantes usadas pelos dois lados
tests/           unidade, motor de vídeo e roteiros de interface
licenses/        licenças de terceiros (vão no instalador)
```

## Licenças

Os componentes de terceiros e suas licenças estão em [`licenses/`](licenses/) e vão dentro do instalador (no app: tela de boas-vindas → "Licenças de terceiros").

- **FFmpeg** (Windows: 6.1.1 "essentials", gyan.dev) — **GPL v3**, executado como processo separado e sem modificações. O texto da licença e a oferta do código-fonte estão em `licenses/AVISOS-DE-TERCEIROS.txt`, gerado a cada build.
- **whisper.cpp** e modelos Whisper — MIT.
- **Montserrat** — SIL Open Font License 1.1.

O código do Kortin é de uso restrito (todos os direitos reservados), salvo os componentes de terceiros acima.
