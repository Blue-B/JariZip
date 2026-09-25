import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalJobUrl } from './jobSearch';
import { searchRemoteJobs, type SearchSource, type SearchResult } from './remoteJobs';

interface Filters { source: SearchSource; query: string; location: string; category: string; experience: string; revision: number }

/** Search state is ephemeral: browsing never writes listings to the user's saved workspace. */
export function useJobFeed(filters: Filters) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [batch, setBatch] = useState(0);
  const [added, setAdded] = useState(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; busy.current = true;
    setLoading(true); setLoadingMore(false); setError(''); setMoreError(''); setResult(null); setBatch(0); setAdded(0);
    void searchRemoteJobs(filters.source, filters.query, filters.location, 0, controller.signal, filters.revision > 0, filters.category, filters.experience, 'start')
      .then(value => { if (!controller.signal.aborted && version === generation.current) { setResult(value); setBatch(1); setAdded(value.jobs.length); } })
      .catch(problem => { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : '공고를 가져오지 못했어요.'); })
      .finally(() => { if (!controller.signal.aborted && version === generation.current) { busy.current = false; setLoading(false); } });
    return () => { controller.abort(); request.current?.abort(); };
  }, [filters]);

  const hasMore = result !== null && (result.nextCursor === undefined ? result.nextPage !== null : result.nextCursor !== null);
  const loadMore = useCallback(async () => {
    if (busy.current || !result || !hasMore) return;
    busy.current = true; setLoadingMore(true); setMoreError('');
    const version = generation.current, controller = new AbortController(); request.current = controller;
    try {
      const next = await searchRemoteJobs(filters.source, filters.query, filters.location, result.nextPage ?? batch, controller.signal, false, filters.category, filters.experience, result.nextCursor ?? undefined);
      if (controller.signal.aborted || version !== generation.current) return;
      const jobs = new Map(result.jobs.map(job => [canonicalJobUrl(job.sourceUrl), job]));
      const before = jobs.size;
      for (const job of next.jobs) jobs.set(canonicalJobUrl(job.sourceUrl), job);
      setAdded(jobs.size - before);
      setResult({ ...next, jobs: [...jobs.values()] }); setBatch(value => value + 1);
    } catch (problem) {
      if (!controller.signal.aborted) setMoreError(problem instanceof Error ? problem.message : '추가 공고를 가져오지 못했어요.');
    } finally {
      if (!controller.signal.aborted && version === generation.current) { busy.current = false; setLoadingMore(false); }
    }
  }, [result, hasMore, filters, batch]);
  const canAutoLoad = hasMore && !loading && !loadingMore && !moreError && added > 0 && !result?.sourceResults.some(source => source.status === 'error');
  return { result, loading, loadingMore, error, moreError, batch, added, hasMore, canAutoLoad, loadMore };
}
