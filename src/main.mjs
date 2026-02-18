import protobuf from 'protobufjs/light';

// expose globally for API module
globalThis.protobuf = protobuf;

import { initTrackDb } from './db/trackDb.mjs';
import { initProductState, getTrackInfoBatch } from './api/metadata.mjs';
import { getArtistGenresBatch } from './api/genres.mjs';
import { generateCsv, downloadCsv } from './export/csv.mjs';

(async function exportDjCsv() {
  while (!Spicetify?.showNotification) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const { CosmosAsync, URI } = Spicetify;
  if (!(CosmosAsync && URI)) {
    setTimeout(exportDjCsv, 300);
    return;
  }

  initTrackDb();
  await initProductState();

  async function fetchPlaylistTracks(playlistUri) {
    const contents = await Spicetify.Platform.PlaylistAPI.getContents(playlistUri);
    return (contents?.items || []).filter((item) => item?.uri?.startsWith('spotify:track:'));
  }

  async function fetchPlaylistName(playlistUri) {
    try {
      const metadata = await Spicetify.Platform.PlaylistAPI.getMetadata(playlistUri);
      return metadata?.name || null;
    } catch {
      return null;
    }
  }

  async function fetchTrackIsrcs(trackIds) {
    const isrcMap = {};
    const BATCH_SIZE = 50;

    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
      const batch = trackIds.slice(i, i + BATCH_SIZE);
      try {
        const response = await Spicetify.CosmosAsync.get(
          `https://api.spotify.com/v1/tracks?ids=${batch.join(',')}`,
        );
        if (response?.tracks) {
          response.tracks.forEach((track) => {
            if (track) {
              isrcMap[track.id] = track.external_ids?.isrc || 'N/A';
            }
          });
        }
      } catch (error) {
        console.error('Export DJ CSV: Error fetching ISRCs:', error);
      }
    }

    return isrcMap;
  }

  async function exportPlaylist(uris) {
    const playlistUri = uris[0];

    Spicetify.showNotification('Export DJ CSV: Fetching track data…');

    try {
      // 1. Get playlist tracks and name
      const [items, playlistName] = await Promise.all([
        fetchPlaylistTracks(playlistUri),
        fetchPlaylistName(playlistUri),
      ]);

      if (items.length === 0) {
        Spicetify.showNotification('Export DJ CSV: No tracks found in playlist.', true);
        return;
      }

      const trackIds = items.map((item) => item.uri.split(':')[2]);

      // 2. Collect all unique artist IDs
      const allArtistIds = new Set();
      items.forEach((item) => {
        (item.artists || []).forEach((artist) => {
          const artistId = artist.uri?.split(':')[2];
          if (artistId) allArtistIds.add(artistId);
        });
      });

      // 3. Fetch audio features, ISRCs, and genres in parallel
      const CHUNK_SIZE = 100;
      const audioInfoPromises = [];
      for (let i = 0; i < trackIds.length; i += CHUNK_SIZE) {
        audioInfoPromises.push(getTrackInfoBatch(trackIds.slice(i, i + CHUNK_SIZE)));
      }

      const [audioInfoChunks, isrcMap, genreMap] = await Promise.all([
        Promise.all(audioInfoPromises),
        fetchTrackIsrcs(trackIds),
        getArtistGenresBatch(Array.from(allArtistIds)),
      ]);

      const audioInfoFlat = audioInfoChunks.flat();

      // 4. Build combined track data
      const trackData = items.map((item, index) => {
        const id = trackIds[index];
        const info = audioInfoFlat[index];

        // Collect genres from all artists on this track (deduplicated)
        const genres = (item.artists || [])
          .flatMap((artist) => {
            const artistId = artist.uri?.split(':')[2];
            return artistId ? genreMap[artistId] || [] : [];
          })
          .filter((genre, i, arr) => arr.indexOf(genre) === i);

        return {
          title: item.name || 'N/A',
          artist: (item.artists || []).map((a) => a.name).join(', ') || 'N/A',
          album: item.album?.name || 'N/A',
          isrc: isrcMap[id] || 'N/A',
          spotifyId: id,
          bpm: info?.tempo ?? null,
          key: info?.key ?? -1,
          mode: info?.mode ?? -1,
          energy: info?.energy ?? null,
          genres: genres.length > 0 ? genres.join('; ') : 'N/A',
        };
      });

      // 5. Generate and download CSV
      const csvContent = generateCsv(trackData);
      const safeName = (playlistName || playlistUri.split(':')[2])
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .trim();
      downloadCsv(csvContent, `dj-export-${safeName}.csv`);

      Spicetify.showNotification(
        `Export DJ CSV: Successfully exported ${trackData.length} tracks!`,
      );
    } catch (error) {
      console.error('Export DJ CSV: Export failed:', error);
      Spicetify.showNotification('Export DJ CSV: Export failed. Check console for details.', true);
    }
  }

  // Register context menu item for playlists
  new Spicetify.ContextMenu.Item(
    'Export DJ CSV',
    exportPlaylist,
    (uris) => uris.some((uri) => uri.startsWith('spotify:playlist:')),
    'download',
  ).register();
})();
