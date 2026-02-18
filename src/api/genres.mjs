/**
 * Artist genre fetching via Spicetify internal APIs.
 * Approach derived from hoeci/sort-play:
 *   Uses Spicetify.CosmosAsync with the internal artists endpoint
 *   to resolve artist genres in batches.
 */

const artistGenreCache = new Map();

export async function getArtistGenresBatch(artistIds) {
  const uncached = artistIds.filter((id) => !artistGenreCache.has(id));

  if (uncached.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      try {
        const response = await Spicetify.CosmosAsync.get(
          `https://api.spotify.com/v1/artists?ids=${batch.join(',')}`,
        );
        if (response?.artists) {
          response.artists.forEach((artist) => {
            if (artist) {
              artistGenreCache.set(artist.id, artist.genres || []);
            }
          });
        }
      } catch (error) {
        console.error('Export DJ CSV: Error fetching artist genres:', error);
      }
      // Fill in any IDs that weren't returned
      batch.forEach((id) => {
        if (!artistGenreCache.has(id)) {
          artistGenreCache.set(id, []);
        }
      });
    }
  }

  const result = {};
  artistIds.forEach((id) => {
    result[id] = artistGenreCache.get(id) || [];
  });
  return result;
}
