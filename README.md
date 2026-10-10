# Kortin ✂️

Editor de vídeo para Windows, simples e rápido, pensado para vídeos curtos (Reels, TikTok, Shorts).

**A promessa:** sem anúncios, sem marca d'água e sem cobrar para você salvar o seu próprio vídeo.
Tudo roda no seu computador, então exportar é sempre grátis e o app funciona offline.

> **Status:** v0.2 (polimento) pronta para testes. Próximo: módulo 2, voz e legenda.

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
| 2 | Legenda automática em português (Whisper rodando no próprio PC) |
| 3 | Corte com IA: vídeo bruto entra, corte pronto sai |
| 4 | Textos, música, transições, filtros e templates |

---

## Como rodar no seu computador

Pré-requisitos: [Node.js 22 LTS](https://nodejs.org) e [Git](https://git-scm.com).

```bash
npm install      # instala tudo (inclui o FFmpeg e o Electron)
npm run dev      # abre o Kortin em modo desenvolvimento
```

Outros comandos:

```bash
npm run test:engine   # testa o motor de vídeo (gera vídeos de teste e exporta)
npm run dist          # gera o .exe na pasta release/
```

## Como publicar no GitHub e gerar o .exe automaticamente

1. Crie um repositório novo no GitHub (ex.: `kortin`).
2. Na pasta do projeto:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/kortin.git
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

1. No `package.json`, troque `SEU-USUARIO-GITHUB` pelo seu usuário do GitHub (em `build.publish`).
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

O FFmpeg incluído é distribuído sob a licença GPL. Antes de vender o app ou fechar o código,
vale revisar essa questão (dá para trocar por um build LGPL do FFmpeg).
