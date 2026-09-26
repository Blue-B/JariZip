import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { createJobService } from '../server/job-sources.mjs';

const args = process.argv.slice(2);
if (args.some(value => value !== '--saramin')) {
  console.error('기본 검사는 외부 네트워크를 사용하지 않습니다. 승인받은 사람인 키의 실제 조회를 검사하려면 --saramin을 명시하세요.');
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
    assert.equal(networkCalls, 0);
    console.log('기본 출처 정책 확인 완료: 비공식 목록·상세·갱신 요청이 외부 전송 전에 차단됐어요. 외부 API는 호출하지 않았어요.');
    if (args.includes('--saramin')) {
      try { loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw new Error('.env.local 설정을 읽지 못했어요.'); }
      const approved = createJobService({ env: process.env });
      const source = approved.sources().find(item => item.id === 'saramin');
      if (!source?.enabled) throw new Error(source?.note || '승인 범위와 사람인 키 설정을 확인해주세요.');
      console.log('명시적으로 요청한 사람인 공식 API 검색 1회를 실행합니다. 발급 키의 사용 한도를 소모합니다.');
      const result = await approved.search({ provider: 'saramin', query: '', page: 0 });
      console.log(`사람인 응답 확인: ${result.jobs.length}개 공고. 결과가 비어 있어도 공고를 만들어 넣지 않아요.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
