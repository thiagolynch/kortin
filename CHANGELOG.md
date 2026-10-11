# Novidades do Kortin

Todas as mudanças relevantes, da mais nova para a mais antiga.
Cada versão publicada em [Releases](https://github.com/thiagolynch/kortin/releases) usa o texto da sua seção.

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
