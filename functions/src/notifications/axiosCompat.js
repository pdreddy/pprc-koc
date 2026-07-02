function create({ baseURL = '', timeout = 10000, headers = {} } = {}) {
  return {
    async post(path, data) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(`${baseURL}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: controller.signal
        });
        const text = await response.text();
        const parsed = text ? JSON.parse(text) : null;
        if (!response.ok) {
          const error = new Error(parsed?.error?.message || `HTTP ${response.status}`);
          error.response = { status: response.status, data: parsed };
          throw error;
        }
        return { status: response.status, data: parsed };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
module.exports = { create };
