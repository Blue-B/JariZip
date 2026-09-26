import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { createJobService } from '../server/job-sources.mjs';

const args = process.argv.slice(2);
const allowed = new Set(['--saramin', '--work24']);
if (args.some(value => !allowed.has(value))) {
  console.error('기본 검사는 외부 네트워크를 사용하지 않습니다. 승인받은 사람인 키의 실제 조회는 --saramin, 고용24 인증키의 실제 조회는 --work24를 명시하세요.');
  process.exitCode = 1;
} else {
  try {
    // This is the safe default even if a developer has real keys in their shell.
    let networkCalls = 0;
    const service = createJobService({ env: {}, fetcher: async () => {
      networkCalls++;
      throw new Error('기본 출처 정책 검사에서 외부 네트워크 요청이 발생했어요.');
    } });
    for (const provider of ['wanted', 'jumpit', 'zighang']) {
      assert.equal(service.sources().find(source => source.id === provider)?.enabled, false);
      await assert.rejects(() => service.search({ provider, query: 'test', page: 0 }));
      await assert.rejects(() => service.detail(provider, provider === 'zighang' ? '00000000-0000-4000-8000-000000000001' : '900001', true));
    }
    // With no server key the approved Work24 adapter must refuse before any network call.
    for (const id of ['KJAS002609110001']) {
      await assert.rejects(() => service.search({ provider: 'work24', query: 'test', page: 0 }), error => error.code === 'KEY_REQUIRED');
      await assert.rejects(() => service.detail('work24', id, true), error => error.code === 'KEY_REQUIRED');
    }
    assert.equal(networkCalls, 0);
    console.log('기본 출처 정책 확인 완료: 비공식 목록·상세·갱신 요청과 키 미설정 공식 출처가 외부 전송 전에 차단됐어요. 외부 API는 호출하지 않았어요.');
    if (args.includes('--saramin') || args.includes('--work24')) {
      try { loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw new Error('.env.local 설정을 읽지 못했어요.'); }
      const approved = createJobService({ env: process.env });
      if (args.includes('--saramin')) {
        const source = approved.sources().find(item => item.id === 'saramin');
        if (!source?.enabled) throw new Error(source?.note || '승인 범위와 사람인 키 설정을 확인해주세요.');
        console.log('명시적으로 요청한 사람인 공식 API 검색 1회를 실행합니다. 발급 키의 사용 한도를 소모합니다.');
        const result = await approved.search({ provider: 'saramin', query: '', page: 0 });
        console.log(`사람인 응답 확인: ${result.jobs.length}개 공고. 결과가 비어 있어도 공고를 만들어 넣지 않아요.`);
      }
      if (args.includes('--work24')) {
        const source = approved.sources().find(item => item.id === 'work24');
        if (!source?.enabled) throw new Error(source?.note || '승인 범위와 고용24 인증키 설정을 확인해주세요.');
        console.log('명시적으로 요청한 고용24 공식 Open API 목록 1회를 실행합니다. 발급 인증키의 사용 한도를 소모합니다.');
        const result = await approved.search({ provider: 'work24', query: '', page: 0 });
        console.log(`고용24 응답 확인: ${result.jobs.length}개 공고. 결과가 비어 있어도 공고를 만들어 넣지 않아요.`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
