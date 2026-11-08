export function capturePayload(tab, tags = '', collectionId = '') {
  if (!tab || typeof tab.url !== 'string') throw new TypeError('No active browser tab');
  let url;
  try { url = new URL(tab.url); } catch { throw new TypeError('Invalid tab URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Only HTTP and HTTPS webpages can be bookmarked');
  }
  const title = typeof tab.title === 'string' ? tab.title.trim().slice(0, 200) : '';
  if (typeof tags !== 'string' || typeof collectionId !== 'string') throw new TypeError('Invalid capture details');
  const normalizedTags = [...new Set(tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))];
  if (normalizedTags.length > 16 || normalizedTags.some(t => t.length > 32)) {
    throw new TypeError('At most 16 tags of 32 characters each are supported');
  }
  return { url: url.href, title, tags: normalizedTags, collectionId: collectionId || null, status: 'unread' };
}
