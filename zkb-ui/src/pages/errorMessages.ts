type Locale = 'zh' | 'en';

const errorMap: Record<string, Record<Locale, string>> = {
  'source and source_type are required': {
    zh: '来源地址和来源类型不能为空',
    en: 'Source and source type are required',
  },
  'file is required': {
    zh: '请选择一个文件上传',
    en: 'Please select a file to upload',
  },
  'query is required': {
    zh: '搜索关键词不能为空',
    en: 'Search query is required',
  },
  'invalid request body': {
    zh: '请求格式错误，请检查输入内容',
    en: 'Invalid request body, please check your input',
  },
  'python service error': {
    zh: 'Python 后端服务异常',
    en: 'Python backend service error',
  },
  'Indexing failed': {
    zh: '文档索引失败',
    en: 'Document indexing failed',
  },
  'lxml': {
    zh: '服务器缺少 HTML 解析库 (lxml)，请联系管理员安装',
    en: 'Server missing HTML parser library (lxml), please contact admin',
  },
  'Couldn\'t find a tree builder': {
    zh: 'HTML 解析器不可用，需要安装 lxml 库',
    en: 'HTML parser unavailable, lxml library required',
  },
  'File is not UTF-8 text': {
    zh: '文件不是 UTF-8 编码的文本文件',
    en: 'File is not UTF-8 encoded text',
  },
  'Network Error': {
    zh: '网络连接失败，请检查服务器是否可访问',
    en: 'Network error, please check if the server is reachable',
  },
  'timeout': {
    zh: '请求超时，请稍后重试',
    en: 'Request timed out, please try again later',
  },
  'default': {
    zh: '操作失败',
    en: 'Operation failed',
  },
};

export function translateError(raw: string | null | undefined, locale: Locale): string {
  if (!raw) return errorMap.default[locale];

  const lower = raw.toLowerCase();

  for (const [key, msgs] of Object.entries(errorMap)) {
    if (raw.includes(key) || lower.includes(key.toLowerCase())) {
      return msgs[locale];
    }
  }

  // Try to extract the last meaningful sentence
  const parts = raw.split(/[:\n]/);
  const last = parts[parts.length - 1]?.trim() || raw;
  if (last.length < 200) return last;

  return locale === 'zh' ? `未知错误: ${raw.slice(0, 100)}` : `Unknown error: ${raw.slice(0, 100)}`;
}

export type { Locale };
