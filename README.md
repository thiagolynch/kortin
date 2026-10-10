# Kortin ✂️

Editor de vídeo para Windows, simples e rápido, pensado para vídeos curtos (Reels, TikTok, Shorts).

**A promessa:** sem anúncios, sem marca d'água e sem cobrar para você salvar o seu próprio vídeo.
Tudo roda no seu computador, então exportar é sempre grátis e o app funciona offline.

> **Status:** Módulo 1 (editor base) pronto para testes.

## O que já funciona (Módulo 1)

**Edição**
- **Importar vídeos** pelo botão ou arrastando os arquivos para a janela (MP4, MOV, MKV, WEBM, AVI…)
- **Linha do tempo** com miniaturas, régua, zoom (`Ctrl + roda do mouse`) e cursor arrastável
- **Cortar** pelas alças laterais do clipe ou pelos botões "Início aqui" / "Fim aqui"
- **Dividir** (`S`), **duplicar** (`Ctrl+D`), **excluir** (`Delete`) e **reordenar** arrastando os clipes
- **Volume por clipe** e botão de silenciar
- **Desfazer / refazer** (`Ctrl+Z` / `Ctrl+Y`)
- **Preview** em tempo real da sequência inteira

**Projetos (seu trabalho nunca se perde)**
- **Salvar e abrir projetos** `.kortin` (`Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+O`, `Ctrl+N`)
- **Recuperação automática:** o projeto é guardado enquanto você edita. Se o PC desligar ou o app fechar,
  na próxima abertura o Kortin oferece recuperar tudo
- **Aviso ao fechar** com alterações não salvas
- **Abrir com o Kortin:** duplo clique em um `.kortin` ou "Abrir com" em um vídeo

**Exportação**
- **Formatos:** 9:16, 16:9, 1:1 e 4:5
- **Enquadramento:** fundo desfocado (estilo Reels), preencher (corta as bordas) ou ajustar (barras pretas)
- **MP4** (H.264 + AAC) em 1080p, 30 fps, com barra de progresso e cancelamento

## Roteiro

| Módulo | Entrega |
|---|---|
| 1 | Editor base ✅ |
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

## Estrutura do projeto

```
electron/
  main.js       → janela, diálogos, protocolo de mídia e exportação
  preload.js    → ponte segura entre a interface e o sistema
  engine.js     → motor de vídeo (FFmpeg): leitura, miniaturas, exportação
src/
  App.jsx       → estado do editor, projetos, recuperação, histórico e atalhos
  components/   → Preview, Linha do tempo, Mídia, Propriedades, Exportação
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
