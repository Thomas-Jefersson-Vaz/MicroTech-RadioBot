// --- Importação de Módulos ---
require('dotenv').config();
const express = require('express');
const axios = require('axios'); // Importa axios para requisições HTTP
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  generateDependencyReport
} = require('@discordjs/voice');
const { PassThrough } = require('stream');

console.log(generateDependencyReport());
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;
const cheerio = require('cheerio');
const packageJson = require('./package.json'); // Importa package.json para versão

// Define o caminho local para o binário (mais seguro que global)
const binaryPath = path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const ytDlpWrap = new YTDlpWrap(binaryPath);

// Função para garantir que o binário existe
(async () => {
  console.log(`Verificando binário do yt-dlp em: ${binaryPath}`);
  if (!fs.existsSync(binaryPath)) {
    console.log("Binário não encontrado. Baixando...");
    try {
      await YTDlpWrap.downloadFromGithub(binaryPath);
      console.log("Binário do yt-dlp baixado com sucesso!");
    } catch (e) {
      console.error("Erro ao baixar yt-dlp:", e);
    }
  } else {
    console.log("Binário do yt-dlp já existe.");
  }
})();

// --- Configurações Iniciais ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json()); // Habilita o Express a ler o corpo JSON do n8n

// Inicializa o Cliente Discord com os Intents necessários
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates, // CRUCIAL para conexão de voz
  ],
});

// --- Gerenciamento de Sessões (Multi-Guilda) ---
const sessions = new Map();

function getSession(guildId) {
  if (!sessions.has(guildId)) {
    const player = createAudioPlayer();

    // Configura eventos do player para esta sessão
    player.on(AudioPlayerStatus.Playing, () => {
      const session = sessions.get(guildId);
      if (session) {
        // Se estava pausado, ajusta o playbackStartTime
        if (session.pauseStartTime) {
          const pausedDuration = Date.now() - session.pauseStartTime;
          session.playbackStartTime += pausedDuration;
          session.pauseStartTime = null;
        }

        const latency = Date.now() - session.playbackStartTime;
        console.log(`[${guildId}] Player: Tocando música. (Latência: ${latency}ms)`);
        updateRichPresence();
      }
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[${guildId}] Player: Ocioso. Verificando fila...`);
      const session = sessions.get(guildId);
      if (session) {
        const lastSong = session.currentSong;
        const lastChannelId = lastSong ? lastSong.channelId : null;
        session.currentSong = null;
        session.pauseStartTime = null; // Limpa estado de pausa
        updateRichPresence();
        processQueue(guildId, lastChannelId);
      }
    });

    player.on('error', error => {
      console.error(`[${guildId}] Player Error: ${error.message}`);
      const session = sessions.get(guildId);
      if (session) {
        const lastSong = session.currentSong;
        const lastChannelId = lastSong ? lastSong.channelId : null;
        session.currentSong = null;
        processQueue(guildId, lastChannelId);
      }
    });

    sessions.set(guildId, {
      player: player,
      queue: [],
      currentSong: null,
      connection: null,
      playbackStartTime: 0,
      pauseStartTime: null // Para ajustar o timer em pausas
    });
  }
  return sessions.get(guildId);
}

// Função para atualizar o Rich Presence (Status do Bot)
function updateRichPresence() {
  let activeSession = null;
  // Encontra a primeira sessão que está tocando
  for (const [guildId, session] of sessions) {
    if (session.player.state.status === AudioPlayerStatus.Playing && session.currentSong) {
      activeSession = session;
      break;
    }
  }

  const version = packageJson.version;
  const commands = "/play /queue /skip /stop /clear /pause /resume /version";
  let statusText = `v${version} | ${commands}`;


  client.user.setActivity(statusText, { type: ActivityType.Playing });
}

// --- Funções Auxiliares ---

// Função para enviar notificação ao n8n
async function sendNotification(text, guildId, channelId) {
  if (!channelId) return;
  try {
    console.log(`Enviando notificação: "${text}"`);
    await axios.post('https://n8n-bot.thomasjeferssonvaz.dev.br/webhook/discord/genericmessage', {
      text: text,
      guildId: guildId,
      channelId: channelId
    });
  } catch (error) {
    console.error("Erro ao enviar notificação webhook:", error.message);
  }
}

// Função para processar a fila
async function processQueue(guildId, lastChannelId = null) {
  const session = getSession(guildId);
  const queue = session.queue;

  if (!queue || queue.length === 0) {
    console.log(`Fila vazia para a guilda ${guildId}. Desconectando...`);
    session.currentSong = null;

    if (session.connection) {
      session.connection.destroy();
      session.connection = null;
      if (lastChannelId) {
        sendNotification("🏁 Fila terminada. Desconectando.", guildId, lastChannelId);
      }
    }
    return;
  }

  const song = queue.shift(); // Remove a próxima música da fila
  await playSong(guildId, song);
}

// Função para tocar uma música
async function playSong(guildId, song) {
  const session = getSession(guildId);
  session.currentSong = song;
  const { musicUrl, channelId, title, duration } = song;

  session.playbackStartTime = Date.now(); // Inicia o timer
  session.pauseStartTime = null; // Reseta pausa
  console.log(`Iniciando playback: ${musicUrl}`);

  try {
    // 1. Conectar ao Canal de Voz (se necessário)
    const guild = client.guilds.cache.get(guildId);
    const member = await guild.members.fetch(song.commandSenderId);
    const voiceChannelId = member.voice.channelId;

    if (voiceChannelId) {
      if (!session.connection) {
        session.connection = joinVoiceChannel({
          channelId: voiceChannelId,
          guildId: guildId,
          adapterCreator: guild.voiceAdapterCreator,
        });

        session.connection.on(VoiceConnectionStatus.Ready, () => {
          console.log(`[${guildId}] Conexão de voz estabelecida.`);
        });

        session.connection.subscribe(session.player);
      }
    }

    // 2. Otimização de Latência: Iniciar Stream IMEDIATAMENTE
    // Não esperamos pelos metadados se não tivermos (para o caso de play imediato)

    const ytDlpArgs = [
      musicUrl,
      '-f', 'bestaudio',
      '--no-playlist',
      '--force-ipv4', // Otimização: Força IPv4 para evitar timeouts de IPv6
      '-o', '-'
    ];

    const streamProcess = ytDlpWrap.execStream(ytDlpArgs);
    // Revertendo para 2MB: 64KB causou starvation/latência maior. 2MB é um bom equilíbrio.
    const audioBuffer = new PassThrough({ highWaterMark: 1024 * 1024 * 2 });
    streamProcess.pipe(audioBuffer);

    streamProcess.on('error', (error) => {
      console.error('Erro no processo yt-dlp:', error);
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        // Se der erro fatal, tenta pular para a próxima
        console.log("Erro fatal no stream, pulando para a próxima...");
        processQueue(guildId, channelId);
      }
    });

    const resource = createAudioResource(audioBuffer);
    session.player.play(resource);

    // 3. Notificar "Tocando Agora" e Atualizar Título se necessário
    let displayTitle = title;
    if (!displayTitle) {
      // Busca título em paralelo sem bloquear o áudio
      ytDlpWrap.execPromise([musicUrl, '--dump-json', '--no-playlist'])
        .then(metadata => {
          const json = JSON.parse(metadata);
          displayTitle = json.title;
          const duration = json.duration; // Captura duração

          // Atualiza o título e duração no objeto currentSong
          const current = session.currentSong;
          if (current) {
            current.title = displayTitle;
            current.duration = duration;
          }

          sendNotification(`Tocando agora: **${displayTitle}**`, guildId, channelId);
        })
        .catch(e => console.error("Erro ao buscar título em background:", e));
    } else {
      sendNotification(`Tocando agora: **${displayTitle}**`, guildId, channelId);
    }

  } catch (error) {
    console.error("Erro em playSong:", error);
    // Tenta próxima
    processQueue(guildId, channelId);
  }
}

// --- Eventos do Player removidos daqui pois são anexados dinamicamente em getSession ---

// --- Endpoint HTTP para o n8n ---
app.post('/play', async (req, res) => {
  let { guildId, commandSenderId, musicUrl, channelId } = req.body;

  if (!guildId || !commandSenderId || !musicUrl) {
    return res.status(400).send({ error: "Parâmetros incompletos." });
  }

  // Garante que guildId seja string para consistência no Map
  guildId = String(guildId);

  const session = getSession(guildId);
  const queue = session.queue;

  // --- Spotify Handling ---
  if (musicUrl.includes('spotify.com') && musicUrl.includes('/track/')) {
    try {
      console.log(`Spotify URL detectada: ${musicUrl}`);
      //sendNotification("🔎 Processando link do Spotify...", guildId, channelId);

      const spotifyData = await resolveSpotifyTrack(musicUrl);
      if (spotifyData) {
        console.log(`Spotify Resolvido: ${spotifyData}`);
        // Busca no YouTube com sufixo para melhorar precisão
        const searchQuery = `ytsearch1:${spotifyData} Official Audio`;
        const searchResults = await ytDlpWrap.execPromise([searchQuery, '--dump-single-json', '--flat-playlist']);
        const searchJson = JSON.parse(searchResults);

        if (searchJson.entries && searchJson.entries.length > 0) {
          const firstResult = searchJson.entries[0];
          const youtubeUrl = firstResult.url || `https://www.youtube.com/watch?v=${firstResult.id}`;
          console.log(`YouTube URL encontrado: ${youtubeUrl}`);
          musicUrl = youtubeUrl; // Substitui a URL do Spotify pela do YouTube
          //sendNotification(`✅ Encontrado no YouTube: **${firstResult.title}**`, guildId, channelId);
        } else {
          throw new Error("Nenhum resultado encontrado no YouTube para esta música.");
        }
      } else {
        throw new Error("Não foi possível extrair dados do Spotify.");
      }
    } catch (error) {
      console.error("Erro ao processar Spotify:", error);
      return res.status(500).send({ error: `Erro ao processar Spotify: ${error.message}` });
    }
  }

  // Verifica se é Playlist ou Vídeo Único
  try {
    console.log(`Processando URL: ${musicUrl}`);

    // Busca metadata básico
    const info = JSON.parse(await ytDlpWrap.execPromise([musicUrl, '--dump-single-json', '--flat-playlist']));

    let addedCount = 0;
    let firstSongTitle = "";

    if (info._type === 'playlist' && info.entries) {
      // É uma playlist
      console.log(`Playlist detectada: ${info.title} com ${info.entries.length} itens.`);

      for (const entry of info.entries) {
        const song = {
          musicUrl: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
          title: entry.title,
          duration: entry.duration, // Captura duração se disponível
          guildId,
          commandSenderId,
          channelId
        };
        queue.push(song);
        addedCount++;
        if (addedCount === 1) firstSongTitle = entry.title;
      }

      sendNotification(`Adicionado à fila: Playlist **${info.title}** (${addedCount} músicas)`, guildId, channelId);

    } else {
      // Vídeo único
      const song = {
        musicUrl: musicUrl,
        title: info.title,
        duration: info.duration, // Captura duração
        guildId,
        commandSenderId,
        channelId
      };
      queue.push(song);
      addedCount = 1;
      firstSongTitle = info.title;

      // Só notifica se já estiver tocando algo (se não estiver, vai tocar agora)
      if (session.currentSong) {
        sendNotification(`Adicionado à fila: **${info.title}**`, guildId, channelId);
      }
    }

    // Se NÃO estiver tocando nada nesta guilda, começa a tocar
    if (!session.currentSong) {
      processQueue(guildId);
    }

    res.status(200).send({
      message: "Solicitação processada.",
      queued: addedCount,
      firstTitle: firstSongTitle
    });

  } catch (error) {
    console.error("Erro ao processar solicitação:", error);
    res.status(500).send({ error: "Erro ao processar URL." });
  }
});

// --- Endpoint GET /queue/:guildId ---
app.get('/queue/:guildId', (req, res) => {
  let { guildId } = req.params;
  guildId = String(guildId); // Garante string

  guildId = String(guildId); // Garante string

  const session = getSession(guildId);
  const queue = session.queue;
  const current = session.currentSong;

  // Helper para formatar tempo (segundos -> MM:SS)
  const formatTime = (seconds) => {
    if (!seconds) return "??:??";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Calcula tempos
  let currentRemaining = 0;
  let currentDuration = 0;
  let totalQueueDuration = 0;

  if (current) {
    currentDuration = current.duration || 0;

    // Calcula decorrido considerando pausa atual
    let elapsed = 0;
    if (session.pauseStartTime) {
      // Se está pausado agora, o tempo parou em pauseStartTime
      elapsed = (session.pauseStartTime - session.playbackStartTime) / 1000;
    } else {
      elapsed = (Date.now() - session.playbackStartTime) / 1000;
    }

    currentRemaining = Math.max(0, currentDuration - elapsed);
    totalQueueDuration += currentRemaining;
  }

  // Soma duração da fila
  queue.forEach(song => {
    totalQueueDuration += (song.duration || 0);
  });

  // Mapeia a fila para retornar apenas dados relevantes
  const mappedQueue = queue.map(song => ({
    title: song.title,
    url: song.musicUrl,
    duration: song.duration,
    formattedDuration: formatTime(song.duration),
    requestedBy: song.commandSenderId,
    channelId: song.channelId
  }));

  // Constrói o texto formatado com Markdown do Discord
  let formattedText = `**🎶 Música Atual:** *${current ? `${current.title} (${formatTime(currentDuration - currentRemaining)} / ${formatTime(currentDuration)})` : "Nenhuma"}*\n\n`;

  if (queue.length > 0) {
    formattedText += `**➡️ Próximo (${queue.length} na fila):**\n`;
    queue.slice(0, 10).forEach((song, index) => {
      formattedText += `${index + 1}. **${song.title}** (${formatTime(song.duration)}) (Solicitada por: <@${song.commandSenderId}>)\n`;
    });
    if (queue.length > 10) {
      formattedText += `... e mais ${queue.length - 10} na fila.\n`;
    }
  } else {
    formattedText += "**➡️ A fila está vazia.**\n";
  }

  formattedText += `\n**⏳ Tempo total estimado:** ${formatTime(totalQueueDuration)}`;

  const response = {
    current: current ? {
      title: current.title,
      url: current.musicUrl,
      duration: current.duration,
      remaining: currentRemaining,
      formattedDuration: formatTime(current.duration),
      requestedBy: current.commandSenderId,
      channelId: current.channelId
    } : null,
    queue: mappedQueue,
    total: queue.length,
    totalDuration: totalQueueDuration,
    formattedTotalDuration: formatTime(totalQueueDuration),
    formatted: formattedText
  };

  res.status(200).json(response);
});

// --- Endpoint POST /skip ---
app.post('/skip', async (req, res) => {
  let { guildId, channelId } = req.body;
  if (!guildId) return res.status(400).send({ error: "Parâmetros incompletos." });
  guildId = String(guildId);

  // Verifica se há uma música atual registrada para esta guilda
  const session = getSession(guildId);

  if (session.currentSong) {
    session.player.stop(); // Dispara o evento Idle, que toca a próxima
    sendNotification("⏭️ Música pulada.", guildId, channelId);
    res.status(200).send({ message: "Skipped" });
  } else {
    sendNotification("⚠️ Não tem nenhuma música tocando para pular.", guildId, channelId);
    res.status(200).send({ message: "Not playing" });
  }
});

// --- Endpoint POST /stop ---
app.post('/stop', async (req, res) => {
  let { guildId, channelId } = req.body;
  if (!guildId) return res.status(400).send({ error: "Parâmetros incompletos." });
  guildId = String(guildId);

  const session = getSession(guildId);

  // Limpa a fila
  session.queue = [];
  session.currentSong = null;

  session.player.stop();
  updateRichPresence();

  // Desconecta do canal de voz
  if (session.connection) {
    session.connection.destroy();
    session.connection = null;
    sendNotification("🛑 Playback parado, fila limpa e desconectado.", guildId, channelId);
  } else {
    sendNotification("🛑 Fila limpa (bot não estava conectado).", guildId, channelId);
  }

  res.status(200).send({ message: "Stopped and disconnected" });
});

// --- Endpoint POST /clear ---
app.post('/clear', async (req, res) => {
  let { guildId, channelId } = req.body;
  if (!guildId) return res.status(400).send({ error: "Parâmetros incompletos." });
  guildId = String(guildId);

  const session = getSession(guildId);
  session.queue = [];
  sendNotification("🗑️ Fila limpa!", guildId, channelId);

  res.status(200).send({ message: "Queue cleared" });
});

// --- Endpoint POST /pause ---
app.post('/pause', async (req, res) => {
  let { guildId, channelId } = req.body;
  if (!guildId) return res.status(400).send({ error: "Parâmetros incompletos." });

  const session = getSession(guildId);

  if (session.player.state.status === AudioPlayerStatus.Playing) {
    session.player.pause();
    session.pauseStartTime = Date.now(); // Marca inicio da pausa
    updateRichPresence(); // Pode atualizar status para "Paused"?
    sendNotification("⏸️ Música pausada.", guildId, channelId);
    res.status(200).send({ message: "Paused" });
  } else {
    sendNotification("⚠️ Não tem nenhuma música tocando no momento.", guildId, channelId);
    res.status(200).send({ message: "Not playing" });
  }
});

// --- Endpoint POST /resume ---
app.post('/resume', async (req, res) => {
  let { guildId, channelId } = req.body;
  if (!guildId) return res.status(400).send({ error: "Parâmetros incompletos." });

  const session = getSession(guildId);

  if (session.player.state.status === AudioPlayerStatus.Paused) {
    session.player.unpause();
    // O ajuste de playbackStartTime é feito no evento 'Playing'
    sendNotification("▶️ Música retomada.", guildId, channelId);
    res.status(200).send({ message: "Resumed" });
  } else {
    sendNotification("⚠️ Não tem nenhuma música pausada no momento.", guildId, channelId);
    res.status(200).send({ message: "Not paused" });
  }
});

// --- Endpoint POST /version ---
app.post('/version', (req, res) => {
  const { guildId, channelId } = req.body;
  const packageJson = require('./package.json');
  const version = packageJson.version;

  if (guildId && channelId) {
    sendNotification(`🤖 Bot Version: **v${version}**`, guildId, channelId);
  }
  res.status(200).send({ version });
});

// --- Inicialização do Bot ---
client.on('ready', () => {
  console.log(`🤖 Bot Discord logado como ${client.user.tag}`);
  updateRichPresence(); // Define status inicial

  // Inicia o servidor Express para comunicação com o n8n
  app.listen(PORT, () => {
    console.log(`🌍 Servidor HTTP do Bot rodando em http://localhost:${PORT}/`);
    console.log(`Pronto para receber comandos do n8n na sua rede 192.168.3.0/24.`);
  });
});

client.login(process.env.DISCORD_TOKEN);

// --- Funções de Resolução do Spotify ---
async function resolveSpotifyTrack(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');

    if (!ogTitle) return null;

    let artist = "";
    let song = ogTitle;

    if (ogDesc) {
      // Formato comum: "Artist · Song · Year" ou "Artist, Artist2 · Song · Year"
      const parts = ogDesc.split(' · ');
      if (parts.length >= 1) {
        artist = parts[0];
      }
    }

    return `${artist} - ${song}`;
  } catch (error) {
    console.error("Erro no resolveSpotifyTrack:", error.message);
    return null;
  }
}
