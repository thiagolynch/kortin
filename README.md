# Kortin ✂️

Editor de vídeo para Windows, simples e rápido, pensado para vídeos curtos (Reels, TikTok, Shorts).

**A promessa:** sem anúncios, sem marca d'água e sem cobrar para você salvar o seu próprio vídeo.
Tudo roda no seu computador, então exportar é sempre grátis e o app funciona offline.

> **Status:** v0.3 (legenda automática e limpeza da fala) pronta para testes. Próximo: módulo 3, corte com IA.

## O que já funciona (Módulo 1)

**Edição**
- **Importar vídeos** pelo botão ou arrastando os arquivos para a janela (MP4, MOV, MKV, WEBM, AVI…)
- **Linha do tempo** com miniaturas, régua, zoom (`Ctrl + roda do mouse`) e cursor arrastável
- **Cortar** pelas alças laterais do clipe ou pelos botões "Início aqui" / "Fim aqui"
- **Dividir** (`S`), **duplicar** (`Ctrl+D`), **excluir** (`Delete`) e **reordenar** arrastando os clipes
- **Volume por clipe até 200%**, botão de silenciar e **fade** de entrada e saída
- **Velocidade do clipe** de 0,25x a 4x (o áudio acompanha sem mudar o tom da voz)
- **Onda sonora** em cada clipe e **ímã** que gruda cortes e cursor nas emendas (`N` liga/desliga, `Alt` arrasta sem ímã)
- **Desfazer / refazer** (`Ctrl+Z` / `Ctrl+Y`)
- **Preview** em tempo real da sequência inteira

**Legenda automática (IA no seu PC, sem créditos e sem internet)**
- Transcreve a fala em **português**, inglês ou espanhol com o whisper.cpp, palavra por palavra
- Três modelos: **Rápido** (148 MB), **Preciso** (488 MB) e **Máximo** (574 MB), baixados uma única vez
- Estilos **Clássica, Destaque** (palavra da vez em amarelo), **Caixa** e **Neon**, com tamanho, altura e maiúsculas
- A legenda **acompanha os cortes**: dividir, reordenar ou mudar a velocidade não desalinha nada
- **Editar o texto** de cada legenda (duplo clique) e legenda **queimada no vídeo** na exportação
- **Limpar a fala:** corta pausas longas e vícios ("é", "ãh", "hum"; "né" e "tipo" opcionais), com desfazer
- **Reduzir ruído de fundo** por clipe (aplicado na exportação)

**Projetos (seu trabalho nunca se perde)**
- **Salvar e abrir projetos** `.kortin` (`Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+O`, `Ctrl+N`)
- **Recuperação automática:** o projeto é guardado enquanto você edita. Se o PC desligar ou o app fechar,
  na próxima abertura o Kortin oferece recuperar tudo
- **Aviso ao fechar** com alterações não salvas
- **Abrir com o Kortin:** duplo clique em um `.kortin` ou "Abrir com" em um vídeo

**Exportação**
- **Em segundo plano:** continue editando enquanto exporta; aviso do Windows quando o vídeo fica pronto
- **Vários formatos de uma vez:** marque 9:16, 16:9, 1:1 e 4:5 e o Kortin gera todos
- **Placa de vídeo** (NVIDIA, Intel ou AMD) detectada automaticamente; se falhar, refaz pelo processador
- **Formatos:** 9:16, 16:9, 1:1 e 4:5
- **Enquadramento:** fundo desfocado (estilo Reels), preencher (corta as bordas) ou ajustar (barras pretas)
- **MP4** (H.264 + AAC) em 1080p, 30 fps, com barra de progresso e cancelamento

**Primeiros passos e atualizações**
- **Boas-vindas** na primeira abertura: a promessa do app, escolha do formato e importação, sem cadastro
- **Atualização automática** na versão instalada (veja "Ativar a atualização automática" abaixo)

## Roteiro

| Módulo | Entrega |
|---|---|
| 1 | Editor base ✅ |
| 1.5 | Polimento: onda sonora, ímã, velocidade, fades, fila e formatos múltiplos ✅ |
| 2 | Legenda automática em português (Whisper rodando no próprio PC) ✅ |
| 3 | Corte com IA: vídeo bruto entra, corte pronto sai |
| 4 | Textos, música, transições, filtros e templates |

---

## Como rodar no seu computador

Pré-requisitos: [Node.js 22 LTS](https://nodejs.org) e [Git](https://git-scm.com).

```bash
npm install            # instala tudo (inclui o FFmpeg e o Electron)
npm run setup:whisper  # compila a IA de legenda (uma vez; precisa de git e cmake,
                       # no Windows do "Visual Studio Build Tools" com C++)
npm run dev            # abre o Kortin em modo desenvolvimento
```

Outros comandos:

```bash
npm run test:engine   # testa o motor de vídeo (gera vídeos de teste e exporta)
npm run test:whisper  # baixa o modelo "tiny" e testa a legenda de ponta a ponta
npm run dist          # gera o .exe na pasta release/
```

## Como publicar no GitHub e gerar o .exe automaticamente

1. Crie um repositório novo no GitHub (ex.: `kortin`).
2. Na pasta do projeto:
   ```bash
   git remote add origin https://github.com/thiagolynch/kortin.git
   git push -u origin main
   ```
3. Para lançar uma versão de teste:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. Em alguns minutos, a aba **Actions** gera os arquivos e eles aparecem em **Releases**:
   - `Kortin-Instalador-0.1.0.exe`: instala no PC
   - `Kortin-Portatil-0.1.0.exe`: roda sem instalar (bom para testes)

> Como o app ainda não tem certificado de assinatura digital, o Windows pode mostrar
> "O Windows protegeu o computador". Basta clicar em **Mais informações → Executar assim mesmo**.

## Ativar a atualização automática

1. Já configurada para `github.com/thiagolynch/kortin` (em `build.publish` no `package.json`).
2. O repositório precisa ser **público** (ou o app não consegue ler as versões).
3. A cada nova tag (`v0.2.0`, `v0.3.0`…), o GitHub publica o instalador, o `latest.yml` e o `.blockmap`.
   Quem tem o Kortin **instalado** recebe a versão nova sozinho e vê o aviso "Reiniciar e atualizar".
   A versão **portátil** não se atualiza sozinha: baixe a nova em Releases.

## Estrutura do projeto

```
electron/
  main.js       → janela, diálogos, protocolo de mídia e exportação
  preload.js    → ponte segura entre a interface e o sistema
  engine.js     → motor de vídeo (FFmpeg): leitura, miniaturas, exportação
  transcribe.js → legenda automática com whisper.cpp (download do modelo, transcrição)
  captions.js   → gera o arquivo .ass que queima a legenda no vídeo
src/
  App.jsx       → estado do editor, projetos, recuperação, histórico e atalhos
  components/   → Preview, Linha do tempo, Mídia, Propriedades, Exportação, Fila, Boas-vindas
  lib/          → regras da linha do tempo e o player da sequência
tests/          → teste do motor de vídeo e roteiro visual da interface
build/icon.png  → ícone do app
.github/workflows/build-windows.yml → gera o .exe no GitHub
```

## Tecnologias

Electron · React · Vite · FFmpeg (via `ffmpeg-static`) · electron-builder

## Licenças

A fonte Montserrat (legendas) é distribuída sob a SIL Open Font License (`assets/fonts/OFL-Montserrat.txt`).
O whisper.cpp é MIT; os modelos do Whisper (OpenAI) também são MIT.

O FFmpeg incluído é distribuído sob a licença GPL. Antes de vender o app ou fechar o código,
vale revisar essa questão (dá para trocar por um build LGPL do FFmpeg).
