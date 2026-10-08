import { make, string, int, reply, label, lines, pageOf } from './helpers.js';

const playlist = make('playlist', 'Manage your private playlists.');
const idOption = builder => int(builder, 'id', 'Playlist ID', 1, 2147483647);
const pageOption = builder => int(builder, 'page', 'Page', 1, 1000000, false);
playlist.addSubcommand(s => string(s.setName('create').setDescription('Create a playlist.'), 'name', 'Playlist name', true, 100));
playlist.addSubcommand(s => pageOption(s.setName('list').setDescription('List your playlists and IDs (10 per page).')));
playlist.addSubcommand(s => pageOption(idOption(s.setName('show').setDescription('Show playlist tracks (10 per page).'))));
for (const action of ['delete', 'load']) playlist.addSubcommand(s => idOption(s.setName(action).setDescription(action + ' a playlist.')));
playlist.addSubcommand(s => string(string(idOption(s.setName('add').setDescription('Add a track URL.')), 'url', 'Track URL', true, 2048), 'title', 'Track title', false, 300));
playlist.addSubcommand(s => int(idOption(s.setName('remove').setDescription('Remove a track by its position.')), 'position', 'Track position', 1, 1000000));

export const playlistCommand = { data: playlist, async execute(i, { access, database, actions }) {
    await i.deferReply({ flags: 64 });
    await access.check(i.guildId, i.user.id);
    const action = i.options.getSubcommand();
    const id = i.options.getInteger('id');
    let content;
    switch (action) {
        case 'create': {
            const created = await database.createPlaylist(i.user.id, i.options.getString('name'));
            content = `Created playlist ${label(created.name)} (ID ${created.id}).`;
            break;
        }
        case 'list': {
            const page = pageOf(await database.playlists(i.user.id), i.options.getInteger('page'));
            content = lines(page.items, (item, _index, budget) =>
                `ID ${item.id}: ${label(item.name, budget)} • ${item.count} tracks`, 'Your playlists', page.footer, 'No playlists yet.');
            break;
        }
        case 'show': {
            const result = await database.playlist(i.user.id, id);
            const page = pageOf(result.items, i.options.getInteger('page'));
            content = lines(page.items, (item, _index, budget) =>
                `${item.position}. ${label(item.title || item.url, budget)}`, `${label(result.name)} (ID ${result.id})`, page.footer, 'Playlist is empty.');
            break;
        }
        case 'delete':
            await database.deletePlaylist(i.user.id, id);
            content = 'Playlist deleted.';
            break;
        case 'add': {
            const item = await database.addPlaylistItem(i.user.id, id, { url: i.options.getString('url'), title: i.options.getString('title') });
            content = `Added ${label(item.title || item.url)} at position ${item.position} in playlist ${id}.`;
            break;
        }
        case 'remove':
            await database.removePlaylistItem(i.user.id, id, i.options.getInteger('position'));
            content = 'Track removed.';
            break;
        case 'load': {
            const result = await actions.execute(i.guildId, i.user, 'playlist-load', { id }, { textChannelId: i.channelId });
            content = `Added ${result.count} track(s) from playlist ${id}.`;
            break;
        }
        default: throw new Error('Unknown playlist subcommand');
    }
    await i.editReply(reply(content));
} };
