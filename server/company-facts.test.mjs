import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWanted, normalizeJumpit, normalizeZighang } from './job-sources.mjs';
const checkedAt = '2026-09-26T00:00:00.000Z';

test('company facts retain supplied industry, headcount and age with source attribution but not marketing rankings', () => {
  const job = normalizeWanted({ id: 900001, position: '시험 전용 포지션', status: 'active', company: { name: '가상기업', industry_name: '시험용 소프트웨어' }, company_tags: [{ title: '51~300명' }, { title: '설립4~9년' }, { title: '연봉상위6~10%' }, { title: '퇴사율5%이하' }] }, checkedAt);
  assert.match(job.companyInfo, /업종: 시험용 소프트웨어/);
  assert.match(job.companyInfo, /원티드 등록 정보: 51~300명/);
  assert.match(job.companyInfo, /원티드 등록 정보: 설립4~9년/);
  assert.doesNotMatch(job.companyInfo, /연봉|퇴사율/);
});
test('missing company facts remain empty, not inferred from job title or industry category', () => {
  const wanted = normalizeWanted({ id: 900001, position: '대기업 AI 개발자', status: 'active', company: { name: '가상기업' } }, checkedAt);
  const zighang = normalizeZighang({ id: '12345678-1234-1234-1234-123456789abc', title: '시험용 공고', status: 'ACTIVE', company: { name: '가상기업', hasDetailInfo: true }, depthOnes: ['AI_데이터'] }, checkedAt);
  assert.equal(wanted.companyInfo, ''); assert.equal(zighang.companyInfo, '');
});
test('a source-provided company homepage is labeled as source data and not a claimed company profile', () => {
  const job = normalizeJumpit({ id: 900002, title: '시험용 공고', companyName: '가상기업', companyUrl: 'example.invalid', alwaysOpen: true }, checkedAt);
  assert.equal(job.companyInfo, '출처에 등록된 홈페이지: example.invalid');
});
