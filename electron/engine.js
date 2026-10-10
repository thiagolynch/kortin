// Fachada do motor de vídeo (FFmpeg). Mantém uma porta de entrada única para o processo
// principal e para os testes; a implementação fica em services/ffmpeg/.
const { FFMPEG } = require('./services/ffmpeg/binary');
const { probe, parseProbe, thumbnail } = require('./services/ffmpeg/probe');
const { audioPeaks } = require('./services/ffmpeg/waveform');
const { HW_ENCODERS, encoderArgs, detectHardwareEncoders } = require('./services/ffmpeg/encoders');
const { atempoChain, outDuration, buildGraph, buildExportArgs } = require('./services/ffmpeg/filtergraph');
const { exportVideo } = require('./services/ffmpeg/exporter');

module.exports = {
  FFMPEG,
  HW_ENCODERS,
  probe,
  parseProbe,
  thumbnail,
  audioPeaks,
  encoderArgs,
  detectHardwareEncoders,
  atempoChain,
  outDuration,
  buildGraph,
  buildExportArgs,
  exportVideo,
};
