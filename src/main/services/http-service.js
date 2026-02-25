const https = require('https');

class HttpService {
  /**
   * Make an HTTP request
   * @param {string|URL} url - The URL to request
   * @param {object} options - Request options
   * @param {string} options.method - HTTP method (default: 'GET')
   * @param {object} options.headers - HTTP headers
   * @param {number} options.timeout - Request timeout in ms (default: 30000)
   * @param {string} options.errorMessagePrefix - Prefix for error messages (default: 'API request failed')
   * @param {object|string} body - Request body
   */
  async request(url, options = {}, body = null) {
    const {
      method = 'GET',
      headers = {},
      timeout = 30000,
      errorMessagePrefix = 'API request failed',
      ...otherOptions
    } = options;

    const urlObj = url instanceof URL ? url : new URL(url);

    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
        ...otherOptions
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            let message = `${errorMessagePrefix}: ${res.statusCode} - ${data}`;

            // Try to parse error message from body if it's JSON
            try {
                const json = JSON.parse(data);
                if (json.error && json.error.message) {
                    message = `${errorMessagePrefix}: ${json.error.message}`;
                } else if (json.message) {
                    message = `${errorMessagePrefix}: ${json.message}`;
                }
            } catch (e) {
                // Ignore parse error, stick to default message
            }

            const error = new Error(message);
            error.statusCode = res.statusCode;
            error.data = data;
            reject(error);
          }
        });
      });

      req.on('error', reject);

      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error(`${errorMessagePrefix}: Request timeout`));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }

      req.end();
    });
  }
}

module.exports = new HttpService();
