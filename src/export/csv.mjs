/**
 * CSV generation and Blob download for DJ track data.
 * Uses HTML5 Blob API for browser-based file download (no Node.js fs).
 */

function escapeCsvField(value) {
  if (value === null || value === undefined) return 'N/A';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Camelot wheel: maps Spotify key (0-11 = C..B) and mode (0=minor, 1=major)
// to standard DJ notation e.g. "8A", "3B". The formula offsets are 4 (minor)
// and 7 (major), cycling through 12 positions; 'A'=minor, 'B'=major.
function toCamelotKey(key, mode) {
  if (key == null || key < 0 || mode == null || mode < 0) return 'N/A';
  const MINOR_OFFSET = 4;
  const MAJOR_OFFSET = 7;
  const offset = mode === 0 ? MINOR_OFFSET : MAJOR_OFFSET;
  const camelotNumber = ((7 * key + offset) % 12) + 1;
  const camelotLetter = mode === 0 ? 'A' : 'B';
  return camelotNumber + camelotLetter;
}

export function generateCsv(tracks) {
  const headers = [
    'Title',
    'Artist',
    'Album',
    'ISRC',
    'Spotify ID',
    'BPM',
    'Key (Camelot)',
    'Energy',
    'Genres',
  ];

  const rows = tracks.map((track) => {
    return [
      escapeCsvField(track.title),
      escapeCsvField(track.artist),
      escapeCsvField(track.album),
      escapeCsvField(track.isrc),
      escapeCsvField(track.spotifyId),
      escapeCsvField(track.bpm != null ? track.bpm : 'N/A'),
      escapeCsvField(toCamelotKey(track.key, track.mode)),
      escapeCsvField(track.energy != null && !isNaN(track.energy) ? track.energy : 'N/A'),
      escapeCsvField(track.genres),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

export function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
