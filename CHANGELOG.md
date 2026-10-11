# Novidades do Kortin

Todas as mudanças relevantes, da mais nova para a mais antiga.
Cada versão publicada em [Releases](https://github.com/thiagolynch/kortin/releases) usa o texto da sua seção.

## [0.7.9] — 2026-10-11

### Camada de sobreposição (reação, logo, chroma key)
Primeiro passo rumo a uma timeline com mais de uma trilha — escopo deliberadamente reduzido: uma única camada extra por projeto, não trilhas múltiplas arrastáveis. Pensado para os casos de uso reais mais comuns de um short-form (câmera de reação, logo da marca, personagem em frente a um fundo verde), que é exatamente onde o chroma key apareceu como recurso relevante numa análise comparativa com os 10 editores do estilo CapCut.

- **Vídeo de sobreposição**: um segundo vídeo (ou .mov/.mp4/.webm) por cima da timeline principal, numa janela de tempo fixa, com posição (x/y), tamanho e opacidade ajustáveis.
- **Remoção de fundo verde (chroma key)**: um toggle com cor, sensibilidade e suavização de borda — filtro `colorkey` do FFmpeg.
- Funciona junto com legenda, títulos e música de fundo, inclusive no caminho de exportação em partes (projetos com mais de 16 clipes).
- Reaproveita a infraestrutura existente: mesmo diálogo de importar vídeo e a mesma leitura de metadados já usados para os clipes principais — sem código novo de IPC.

**Limitação honesta**: é uma camada só (não dá pra ter duas sobreposições ao mesmo tempo), sem áudio próprio (o áudio do vídeo de sobreposição não entra no vídeo final) e sem arrastar na timeline — a janela de tempo é fixa, ajustada só pelos campos de início/fim. A remoção do fundo verde também só aparece no vídeo exportado: na prévia o vídeo de sobreposição aparece inteiro (com o fundo), só posicionado e redimensionado, para dar uma ideia de onde ele vai ficar.

### Correção: zoom e vinheta (v0.7.8) não chegavam a funcionar na exportação real
Dois defeitos reais encontrados ao revisar o código da feature anterior, antes de mexer nela de novo:

- Salvar e reabrir um projeto perdia silenciosamente o zoom e a vinheta de cada clipe (`serializeProject`/`restoreClips` nunca incluíam esses dois campos).
- Mais grave: a tela de exportação também nunca incluía zoom e vinheta no trabalho enviado para o motor de exportação — então, embora o recurso funcionasse corretamente por dentro (motor, validação, prévia), **nenhuma exportação feita pela interface do programa realmente usava zoom ou vinheta** desde que foram lançados. Os dois pontos foram corrigidos nesta versão.

## [0.7.8] — 2026-10-11

### Efeitos visuais: zoom (Ken Burns) e vinheta cinematográfica
Primeiros efeitos visuais do Kortin além de cor/transição — ponto fraco real apontado numa análise comparativa com o CapCut:

- **Zoom**: "Aproximar" ou "Afastar" ao longo do clipe (estilo Ken Burns), via `zoompan` do FFmpeg — dá vida a um clipe estático sem precisar cortar mais.
- **Vinheta cinematográfica**: cantos escurecidos + grão sutil e animado (`vignette` + `noise` do FFmpeg), um toggle só, pensado pra dar textura de filme sem virar um efeito pesado.
- Os dois entram por clipe, junto dos outros ajustes (cor, fade, transição) no painel de Propriedades, e combinam entre si e com tudo que já existia.

**Limitação honesta**: a prévia mostra o zoom em tempo real (mesma curva matemática da exportação) e a vinheta escurecendo os cantos, mas o grão da prévia é só uma aproximação visual — o grão real, animado e com textura de ruído de verdade, só aparece no vídeo exportado.

## [0.7.7] — 2026-10-11

### Legenda automática: cor customizável, palavras-chave em destaque e empilhamento
Baseado em padrões vistos em shorts populares (treino, podcast, treino em caixa com número em verde):

- **Cor customizável na legenda automática**: igual já valia pra títulos, agora dá pra escolher a cor do texto e a cor de destaque (paletas rápidas + seletor de cor). O destaque vai pro que já é a "identidade" de cada estilo — caixa de fundo (Caixa), palavra ativa (Destaque) ou brilho do contorno (Neon).
- **Palavras-chave em cor própria**: uma lista de palavras/números (ex.: "30%", "hoje", "grátis") que sempre aparecem na cor escolhida, onde quer que surjam na fala — comparação sem acento/pontuação/caixa, até 20 por projeto.
- **Legenda empilhada**: liga e as últimas falas ficam acima, um pouco menores e apagadas, acumulando linha por linha — o jeito "treino na esteira"/podcast de mostrar contexto sem repetir a legenda inteira.
- Os três recursos funcionam juntos e com os dois jeitos de renderizar legenda que o Kortin já tinha (evento único e destaque palavra por palavra/karaokê) — "prévia = exportação" continua valendo.

**Limitação honesta**: palavra-chave é por palavra inteira (não por trecho de palavra) e o empilhamento mostra sempre as 2 falas anteriores — ainda não é configurável.

## [0.7.6] — 2026-10-11

### Tipografia dos títulos: fontes novas, não só pesos da Montserrat
- **3 fontes de exibição novas**, empacotadas no instalador (Google Fonts, SIL OFL 1.1 — mesma licença da Montserrat): **Anton** (título principal), **Archivo Black** (destaque em caixa) e **Bebas Neue** (sublinhado).
- Cada estilo de título agora tem uma fonte própria de verdade, não só um ajuste de espaçamento entre letras na mesma fonte — o problema real apontado: a variedade visual anterior era pouca pra um app de vídeo curto.
- **Sublinhado mais chamativo**: ganhou um brilho leve (`\blur` no .ass / `text-shadow` na prévia) além do traço, pra destacar mais na tela.
- Tamanhos recalibrados por fonte (cada uma tem proporções diferentes de altura) para manter "prévia = exportação".

## [0.7.5] — 2026-10-11

### Melhores momentos (shorts para TikTok, Reels e YouTube Shorts)
- Nova aba **"Melhores momentos"**: analisa a onda sonora do clipe selecionado (e a transcrição, se já tiver sido feita) e sugere trechos para virar um vídeo curto — tudo local, sem IA paga nem internet.
- Cada sugestão mostra uma **nota comparativa** e o motivo ("pico de energia sonora" ou "pico de energia e fala"); dá para ouvir o trecho antes de decidir.
- Um clique exporta o trecho já em **9:16** — o mesmo corte serve para TikTok, Instagram Reels e YouTube Shorts, que usam esse formato — pela fila de exportação de sempre.
- Pensado para um público maior que o de ferramentas de automação por linha de comando com IA (que exigem assinatura paga e não rodam no Windows): aqui é um botão, local, grátis, sem marca d'água.

## [0.7.4] — 2026-10-11

### Títulos: inspirado em reels, 3 melhorias de tipografia
- **Título + subtítulo**: liga em qualquer estilo de título (opção "Primeira linha maior"). A 1ª linha fica no tamanho normal do estilo e as linhas seguintes encolhem — igual ao "manchete grande + texto menor" comum em reels/posts.
- **Novo estilo "Sublinhado"**: texto puro (sem caixa de fundo), com um traço embaixo, pensado para citações/legendas curtas de destaque.
- **Espaçamento entre letras diferente por estilo** (Título, Destaque, Rodapé, Sublinhado) — cada um com sua própria "assinatura" tipográfica, mesmo usando a mesma fonte (Montserrat).

**Limitação honesta**: o Kortin só empacota duas variações de uma única fonte (Montserrat ExtraBold e Bold — ambas licença SIL OFL, ver `licenses/`). "Fonte diferente por estilo" aqui significa variar o espaçamento entre letras e o peso (ExtraBold/Bold) dessas duas variações — não é possível adicionar tipografias totalmente novas sem aumentar o instalador e revisar licenças.

A prévia mostra exatamente o mesmo resultado (tamanhos, sublinhado e espaçamento) que vai para o vídeo exportado.

## [0.7.3] — 2026-10-11

### Polimento de interface
- **Avisos (toasts)** aparecem e somem com uma transição suave, em vez de surgir/sumir de uma vez.
- **Botões** reagem ao clique (leve encolhimento) e ganharam uma transição mais macia no hover; o mesmo para as abas e os seletores de estilo/formato.
- **Anel de foco pelo teclado** consistente em botões, abas, seletores e campos — útil para quem navega sem mouse.
- **Miniaturas da mídia** sobem levemente e ganham sombra ao passar o mouse, em vez de só trocar a borda.
- **Arrastar um arquivo para a janela** agora anima a entrada do aviso e pulsa suavemente enquanto o arquivo está sobre a janela.
- Seleção de clipe na linha do tempo não "pisca" mais — a borda de seleção também transiciona.

Nenhuma mudança de comportamento, só de sensação de uso (CSS e uma pequena mudança no aviso de notificação).

## [0.7.2] — 2026-10-11

### Títulos: cor, destaque e animação
- Cada título agora pode ter **cor do texto e cor de destaque próprias** (6 combinações prontas + seletor de cor livre), em vez de só as 3 cores fixas dos estilos.
- Nova opção de **entrada**: "Aparece" (como antes) ou **"Salta"** (o texto cresce de 70% a 100% com uma leve mola, além do fade) — títulos novos já nascem com "Salta".
- A prévia mostra exatamente a mesma cor e animação que vai para o vídeo exportado (regra "prévia = exportação").

## [0.7.1] — 2026-10-11

### Correção
- **Vídeo HDR saía esmaecido na exportação.** Vídeos gravados em HDR (iPhone/Android recentes, inclusive com Dolby Vision) usam uma curva de cor (PQ ou HLG) diferente da que o resto da cadeia de exportação espera; sem converter, o resultado final em SDR saía com cores lavadas e menos contraste que o original. O Kortin agora detecta HDR na importação e converte para SDR (`tonemap`) antes de aplicar cor, fades e queimar legenda/título — a prévia não muda, só a exportação.

## [0.7.0] — 2026-10-11

### Cor
- **6 cores prontas por clipe**: Natural, Quente, Frio, Vívido, Vintage e P&B, com miniatura de cada uma e **aplicar a todos**.
- A prévia usa **a mesma matriz de cor** da exportação: o que você vê é o que sai.

### Transições
- **Surge do preto / some no preto** por clipe (até 2 s) e **suavizar todas as emendas** com um clique (0,25 s de cada lado).
- A transição acontece dentro do clipe: a duração do vídeo não muda e a legenda continua sincronizada.

### Títulos
- Nova aba **Textos**: títulos em 3 estilos (Título, Destaque e Rodapé), com duração, altura na tela e entrada/saída suaves.
- Faixa **T** na linha do tempo: arraste o bloco para mudar o momento (um passo de desfazer por arrasto).
- As linhas são quebradas para cada formato (no vertical cabem menos palavras por linha), e a prévia mostra exatamente as linhas que vão para o vídeo.

### Correções
- **Tamanho da legenda na prévia**: desde a v0.3, a prévia mostrava a legenda cerca de 56% maior do que ela saía no vídeo (a fonte é medida de forma diferente no navegador e no gravador de legendas). Agora prévia e vídeo batem ao pixel.
- **Recuperação automática** podia ficar desatualizada enquanto um campo de texto ou controle deslizante estava em edição. Agora grava normalmente.

## [0.6.1] — 2026-10-11

Preparação para o beta fechado.

- **Copiar informações do PC** (tela de ajuda, ícone `?`): versão, Windows 10/11, processador, memória, placa de vídeo, aceleração e modelos de legenda — tudo de uma vez, para colar no relato de um problema. Não inclui nomes de arquivos.
- **Abrir pasta de registros**, para quem quiser mandar o log junto.
- **Link direto de download** no README (`Kortin-Instalador.exe` e `Kortin-Portatil.exe` sempre da versão mais recente).
- Texto do README mais preciso: o processamento é local, mas o primeiro uso da legenda precisa de internet para baixar o modelo de IA (uma vez).
- Novo teste do motor com um projeto completo: 24 clipes em partes, música com abaixamento e legenda queimada.

## [0.6.0] — 2026-10-11

### Cortes sugeridos (Módulo 3) — o Kortin sugere, você decide
- Nova revisão de cortes no painel **Legendas**: cada sugestão mostra o motivo, a posição e quanto tempo economiza.
- Três tipos: **pausas** (limite ajustável de 0,3 s a 2 s), **vícios de linguagem** e **frases reiniciadas** ("hoje eu vou… hoje eu vou mostrar").
- Sugestões **marcadas na linha do tempo** (cheio = vai cortar, tracejado = mantido).
- **Ouvir o trecho** com 1 s de contexto antes e depois, sem sair da lista.
- Atalhos na lista: `↑` `↓` navegam, `A` aceita, `R` rejeita, `O` ouve. Aplicar tudo vira um único `Ctrl+Z`.
- Frases reiniciadas começam desmarcadas: são uma heurística e pedem conferência.

### Música de fundo com abaixamento automático
- Escolha (ou arraste para a janela) um MP3, WAV, M4A, AAC, OGG, OPUS ou FLAC.
- A música **repete até o fim** do vídeo, com volume e fades de entrada e saída.
- **Abaixa sozinha quando há fala** (compressor controlado pela voz, cerca de −12 dB) e volta nas pausas.
- Faixa da música na linha do tempo, com as marcas de onde ela recomeça.
- Funciona também na exportação em partes e acompanha o projeto portátil.

### Projeto e documentação
- README reescrito, com prints, compromissos, atalhos, privacidade e guia para desenvolvedores.
- Este CHANGELOG passa a ser o texto das notas de cada versão publicada.

## [0.5.0] — 2026-10-11

- **Projetos portáteis**: o `.kortin` guarda também o caminho relativo de cada vídeo. Ao abrir em outro PC ou depois de mover a pasta, os vídeos são achados sozinhos.
- Tela **"Arquivos não encontrados"**: localizar um por um ou procurar numa pasta; aviso se o vídeo achado tiver duração diferente.
- **Cache em disco** de leitura, miniatura e onda sonora (LRU de 200 MB): reabrir projetos fica instantâneo.
- **Modelos de IA verificados**: versão fixa no Hugging Face, SHA-256 conferido no download e antes do primeiro uso; o CI confere os hashes.
- **Conformidade GPL**: licenças de terceiros e oferta de código-fonte do FFmpeg dentro do instalador; link "Licenças de terceiros" no app.

## [0.4.0] — 2026-10-10

- Refatoração completa da arquitetura (processo principal em camadas; interface com documento + desfazer de tudo).
- **Segurança**: só arquivos escolhidos pelo usuário, caminhos de rede recusados, validação contra injeção no FFmpeg, gravação atômica, CSP, bloqueio de navegação e permissões.
- **Desempenho**: o cursor não redesenha a tela inteira; buscas em O(log n); exportação em partes para projetos com muitos clipes (160 clipes: de mais de 6 GB de RAM para ~1,2 GB); durações exatas em quadros (legenda sem deriva).
- **Correções**: "Restaurar" agora zera a redução de ruído; arrastar slider vira um único passo de desfazer; MP3 com capa não é mais aceito como vídeo.
- 41 testes de unidade e propriedade + teste do motor ampliado.

## [0.3.0]

- **Legenda automática local** com whisper.cpp: português, inglês e espanhol, palavra por palavra, em três modelos.
- Estilos Clássica, Destaque, Caixa e Neon; texto editável; legenda queimada no vídeo.
- **Limpar a fala**: corte de pausas longas e vícios de linguagem.
- **Reduzir ruído de fundo** por clipe.

## [0.2.0]

- Onda sonora, ímã nas emendas, velocidade de 0,25x a 4x, volume até 200% e fades.
- Exportação em segundo plano, em vários formatos de uma vez, com placa de vídeo e volta automática para o processador.
- Projetos `.kortin`, recuperação automática, aviso ao fechar, boas-vindas e atualização automática.

## [0.1.0]

- Primeira versão: importar, linha do tempo, cortar, dividir, reordenar, desfazer, preview e exportar MP4 em 9:16, 16:9, 1:1 e 4:5.
