function normalizeImageDataUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'indexeddb') return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  let isDataUrl = false;
  let originalMime = '';
  let base64Payload = trimmed;

  if (trimmed.startsWith('data:')) {
    isDataUrl = true;
    const base64Index = trimmed.indexOf(';base64,');
    if (base64Index !== -1) {
      originalMime = trimmed.slice(5, base64Index);
      base64Payload = trimmed.slice(base64Index + 8);
    } else {
      const commaIndex = trimmed.indexOf(',');
      if (commaIndex !== -1) {
        originalMime = trimmed.slice(5, commaIndex);
        base64Payload = trimmed.slice(commaIndex + 1);
      }
    }
  }

  base64Payload = base64Payload.replace(/[\s\r\n\t]/g, '');

  if (base64Payload.startsWith('/9j')) {
    return `data:image/jpeg;base64,${base64Payload}`;
  }
  if (base64Payload.startsWith('iVBOR')) {
    return `data:image/png;base64,${base64Payload}`;
  }
  if (base64Payload.startsWith('UklGR')) {
    return `data:image/webp;base64,${base64Payload}`;
  }

  if (isDataUrl && originalMime) {
    return `data:${originalMime};base64,${base64Payload}`;
  }

  return null;
}

const input = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD...";
console.log("Output for JPEG data URL:");
console.log(normalizeImageDataUrl(input).substring(0, 50));

const input2 = "/9j/4AAQSkZJRgABAQEAAAAAAAD...";
console.log("Output for raw JPEG base64:");
console.log(normalizeImageDataUrl(input2).substring(0, 50));

const input3 = "data:image/png;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD...";
console.log("Output for mismatched PNG data URL:");
console.log(normalizeImageDataUrl(input3).substring(0, 50));
