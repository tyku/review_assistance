import { Logger } from '@nestjs/common';

const logger = new Logger('ProviderHttp');
const transportCodes = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function failureCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.name === 'AbortError') return 'aborted';
    const cause = error.cause;
    if (cause && typeof cause === 'object' && 'code' in cause &&
        typeof cause.code === 'string' && transportCodes.has(cause.code)) {
      return cause.code;
    }
  }
  return 'network-error';
}

export async function requestWithActivity(
  provider: 'GitHub' | 'GitLab',
  operation: 'check-account' | 'load-review' | 'load-diffs',
  request: () => Promise<Response>,
  page?: number,
): Promise<Response> {
  const started = performance.now();
  const activity = `${provider} ${operation}${page === undefined ? '' : ` page=${page}`}`;
  logger.log(`${activity} started`);
  try {
    const response = await request();
    const message = `${activity} status=${response.status} durationMs=${Math.round(performance.now() - started)}`;
    if (response.ok) logger.log(message);
    else logger.warn(message);
    return response;
  } catch (error) {
    logger.warn(`${activity} failed reason=${failureCode(error)} durationMs=${Math.round(performance.now() - started)}`);
    throw error;
  }
}
