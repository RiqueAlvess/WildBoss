const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slugFromUrl = (url) => {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'unknown';
  } catch {
    return 'unknown';
  }
};

const parseJsonFromClass = (className) => {
  if (!className) return null;
  const match = className.match(/\{.*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0].replace(/'/g, '"'));
  } catch {
    return null;
  }
};

const toAbsoluteUrl = (href, base, domain) => {
  try {
    const absolute = new URL(href, base).toString();
    if (!absolute.startsWith(domain)) return null;
    return absolute.split('#')[0];
  } catch {
    return null;
  }
};

module.exports = {
  sleep,
  slugFromUrl,
  parseJsonFromClass,
  toAbsoluteUrl,
};
