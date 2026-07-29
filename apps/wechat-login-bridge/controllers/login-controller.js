const BASE_URL = 'https://askcore.cn';

const CAPABILITY_PATTERN = /^[\w-]{43}$/;
const TRANSACTION_PATTERN = /^wxm_[\w-]{16,96}$/;

function parseLaunchOptions(options) {
  const purpose = options && options.p;
  const transactionId = options && options.t;
  const completionCapability = options && options.c;
  if (
    !['signin', 'rebind'].includes(purpose) ||
    !TRANSACTION_PATTERN.test(transactionId || '') ||
    !CAPABILITY_PATTERN.test(completionCapability || '')
  ) {
    throw new Error('invalid_launch');
  }
  return Object.freeze({ completionCapability, purpose, transactionId });
}

function endpointForPurpose(purpose) {
  if (purpose === 'signin') return '/api/auth/wechat-mobile/confirm';
  if (purpose === 'rebind') return '/api/auth/wechat-rebind/prove';
  throw new Error('invalid_purpose');
}

function wxLogin(wxApi) {
  return new Promise((resolve, reject) => {
    wxApi.login({
      fail: () => reject(new Error('wx_login_failed')),
      success: ({ code }) => (code ? resolve(code) : reject(new Error('wx_login_failed'))),
      timeout: 8000,
    });
  });
}

function wxRequest(wxApi, path, body) {
  return new Promise((resolve, reject) => {
    wxApi.request({
      data: body,
      fail: () => reject(new Error('askcore_unavailable')),
      header: { 'content-type': 'application/json' },
      method: 'POST',
      success: ({ data, statusCode }) => {
        if (statusCode === 200) resolve(data);
        else if ([429, 502, 503].includes(statusCode)) {
          reject(new Error('askcore_unavailable'));
        } else {
          reject(new Error(statusCode === 423 ? 'maintenance' : 'authorization_failed'));
        }
      },
      timeout: 8000,
      url: `${BASE_URL}${path}`,
    });
  });
}

async function authorize(wxApi, launch) {
  const code = await wxLogin(wxApi);
  const body = {
    code,
    completionCapability: launch.completionCapability,
    transactionId: launch.transactionId,
  };
  return wxRequest(wxApi, endpointForPurpose(launch.purpose), body);
}

module.exports = {
  authorize,
  endpointForPurpose,
  parseLaunchOptions,
};
