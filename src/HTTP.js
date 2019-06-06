const Lang = imports.lang;
const Soup = imports.gi.Soup;

const Local = imports.misc.extensionUtils.getCurrentExtension();
const Config = imports.misc.config;

function HTTPError(soupMessage, error) {
    this.name = "HTTPError";
    this.soupMessage = soupMessage;
    this.stack = (new Error()).stack;

    this.toString = () =>
        "method=" + this.soupMessage.method +
        " uri=" + this.soupMessage.uri.to_string(false /* short */) +
        " status_code=" + this.soupMessage.status_code +
        " reason_phrase= " + this.soupMessage.reason_phrase;
}

HTTPError.prototype = Object.create(Error.prototype);
HTTPError.prototype.constructor = HTTPError;

const STATUS_TOO_MANY_REQUESTS = 429;

const isErrTooManyRequests = (err) =>
    err &&
        err.soupMessage &&
        err.soupMessage.status_code &&
        Number(err.soupMessage.status_code) === STATUS_TOO_MANY_REQUESTS

const getExtensionVersion = () => {
  if (Local.metadata["git-version"]) {
    return "git-" + Local.metadata["git-version"];
  } else if (Local.metadata.version) {
    return "v" + Local.metadata.version;
  } else {
    return "unknown";
  }
};

const getGnomeVersion = () => {
  return Config.PACKAGE_VERSION;
};

const _repository = "http://github.com/OttoAllmendinger/" +
                    "gnome-shell-bitcoin-markets";

const _userAgent =  "gnome-shell-bitcoin-markets" +
                    "/" + getExtensionVersion() +
                    "/Gnome" + getGnomeVersion() +
                    " (" + _repository + ")";


// Some API providers have had issues with high traffic coming from single IPs
// this code helps determine if these are actually different clients from behind
// a NAT or if some clients really do many requests
const getClientId = () => {
  // GUID code from http://stackoverflow.com/a/2117523/92493
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      var r = Math.random()*16|0, v = c == "x" ? r : (r&0x3|0x8);
      return v.toString(16);
  });
};

const _clientId = getClientId();

const _httpSession = new Soup.SessionAsync();


_httpSession["user-agent"] = _userAgent;

Soup.Session.prototype.add_feature.call(
  _httpSession,
  new Soup.ProxyResolverDefault()
);

const cache = new Map();

var getJSON = (url, params) => {
  const message = Soup.Message.new("GET", url);
  const headers = message.request_headers;
  headers.append("X-Client-Id", _clientId);
  // log(`> GET ${url}`);
  return new Promise((resolve, reject) => {
    _httpSession.queue_message(
      message,
      (session, message) => {
        // log(`< GET ${url}: ${message.status_code}`);
        if (message.status_code !== 200) {
          const err = new HTTPError(message);
          logError(err);
          return reject(err);
        }

        if (message.response_body === undefined) {
          return reject(new Error(`GET ${url}: message.response_body not defined`));
        }

        const { response_body } = message;

        if (!("data" in response_body)) {
          return reject(new Error(`GET ${url}: response_body.data not defined`));
        }

        const { data } = message.response_body;

        try {
          return resolve(JSON.parse(message.response_body.data));
        } catch (e) {
          return reject(new Error(
            `GET ${url}: error parsing as JSON: ${e}; data=${JSON.stringify(data)}`
          ));
        }
      }
    );
  });
};
