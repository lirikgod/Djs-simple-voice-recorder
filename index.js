const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, EndBehaviorType } = require('@discordjs/voice');
const fs = require('fs');
const prism = require('prism-media');
const ffmpegpath = require('ffmpeg-static');
const { spawn } = require('child_process');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildEmojisAndStickers, 
        GatewayIntentBits.GuildIntegrations, 
        GatewayIntentBits.GuildWebhooks, 
        GatewayIntentBits.GuildInvites, 
        GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildPresences, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMessageReactions, 
        GatewayIntentBits.GuildMessageTyping, 
        GatewayIntentBits.DirectMessages, 
        GatewayIntentBits.DirectMessageReactions, 
        GatewayIntentBits.DirectMessageTyping, 
        GatewayIntentBits.MessageContent
    ], 
    shards: "auto", 
    partials: [
        Partials.Message, 
        Partials.Channel, 
        Partials.GuildMember, 
        Partials.Reaction, 
        Partials.GuildScheduledEvent, 
        Partials.User, 
        Partials.ThreadMember
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

let audioStreams = new Map();
let connection = null;
let pcmWriteStream = null;
const outputPath = './output.pcm';

client.on('messageCreate', async message => {
    if (message.content === '!!start') {
        if (message.member.voice.channel) {
            connection = joinVoiceChannel({
                channelId: message.member.voice.channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('The bot has connected to the channel!');

                const receiver = connection.receiver;
                pcmWriteStream = fs.createWriteStream(outputPath);

                receiver.speaking.on('start', (userId) => {
                    console.log(`User ${userId} started speaking`);

                    if (audioStreams.has(userId)) {
                        return;
                    }

                    const audioStream = receiver.subscribe(userId, {
                        end: {
                            behavior: EndBehaviorType.AfterSilence,
                            duration: 500
                        }
                    });

                    audioStreams.set(userId, audioStream);

                    const pcmStream = new prism.opus.Decoder({ rate: 16000, channels: 2, frameSize: 960 });

                    audioStream.pipe(pcmStream).pipe(pcmWriteStream, { end: false });

                    pcmStream.on('error', (err) => {
                        console.error('Error in PCM stream:', err);
                    });

                    audioStream.on('error', (err) => {
                        console.error('Error in audio stream:', err);
                    });

                    audioStream.on('end', () => {
                        audioStreams.delete(userId);
                    });
                });

                pcmWriteStream.on('error', (err) => {
                    console.error('Error writing to PCM file:', err);
                });
            });
        } else {
            message.reply('You need to join a voice channel first!');
        }
    }

    if (message.content === '!!end') {
        if (pcmWriteStream) {
            // Закрываем все аудиопотоки перед завершением записи
            audioStreams.forEach((stream) => {
                stream.destroy();
            });

            audioStreams.clear();

            // Завершаем запись PCM файла
            pcmWriteStream.end(() => {
                // Конвертируем PCM в MP3
                const mp3Path = './output.mp3';
                const ffmpeg = spawn(ffmpegpath, [
                    '-f', 's16le', '-ar', '16000', '-ac', '2', 
                    '-i', outputPath,
                    '-b:a', '32k',  // Bitrate
                    '-ar', '16000',  // Sample rate
                    '-ac', '2',      // Mono channel
                    mp3Path
                ]);

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        console.log(`Successfully converted ${outputPath} to ${mp3Path}`);
                        fs.unlinkSync(outputPath); // Удаляем временный PCM файл
                        message.reply('Stopped recording and saved the file as MP3.');
                    } else {
                        console.error(`Error converting ${outputPath} to MP3. Exit code: ${code}`);
                        message.reply('Error occurred during MP3 conversion.');
                    }
                });
            });
        }

        if (connection) {
            connection.destroy();
        }
    }
});

client.login('token here');
