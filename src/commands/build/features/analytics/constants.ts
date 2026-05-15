const METRIKA_URL = 'https://mc.yandex.ru';

export const METRIKA_CSP_RULES = {
    'script-src': [METRIKA_URL],
    'img-src': [METRIKA_URL],
    'connect-src': [METRIKA_URL, 'wss://mc.yandex.ru'],
    'child-src': ['blob:', METRIKA_URL],
    'frame-src': ['blob:', METRIKA_URL],
    'frame-ancestors': ['blob:', METRIKA_URL],
};
