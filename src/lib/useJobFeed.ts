import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalJobUrl } from './jobSearch';
import type { Job } from './types';
import { searchRemoteJobs, type SearchSource, type SearchResult } from './remoteJobs';

interface Filters { source: SearchSource; query: string; location: string; category: string; experience: string; revision: number }
const moreAvailable = (result: SearchResult | null) => result !== null && (result.nextCursor === undefined ? result.nextPage !== null : result.nextCursor !== null);

/** Keep source batches in an ephemeral buffer; the view chooses 30/50-row windows. */
export function useJobFeed(filters: Filters) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const current = useRef<SearchResult | null>(null);
  const resolvedFilters = useRef<Filters | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [added, setAdded] = useState(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const batch = useRef(0);

  useEffect(() => {
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; busy.current = true;
    current.current = null; resolvedFilters.current = null; batch.current = 0;
    setLoading(true); setLoadingMore(false); setError(''); setMoreError(''); setResult(null); setAdded(0);
    void searchRemoteJobs(filters.source, filters.query, filters.location, 0, controller.signal, filters.revision > 0, filters.category, filters.experience, 'start')
      .then(value => {
        if (controller.signal.aborted || version !== generation.current) return;
        const jobs = [...new Map(value.jobs.map(job => [canonicalJobUrl(job.sourceUrl), job])).values()];
        current.current = { ...value, jobs }; resolvedFilters.current = filters; batch.current = 1;
        setResult(current.current); setAdded(jobs.length);
      })
      .catch(problem => { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : '공고를 가져오지 못했어요.'); })
      .finally(() => { if (!controller.signal.aborted && version === generation.current) { busy.current = false; setLoading(false); } });
    return () => { controller.abort(); request.current?.abort(); };
  }, [filters]);

  /** Refill to the display boundary without discarding unused source results.
   * Empty/failed batches stop the loop; retries preserve the exact continuation.
   * Four bounded calls avoid unbounded requests under very sparse filters. */
  const loadThrough = useCallback(async (target: number): Promise<number> => {
    if (busy.current || !current.current) return current.current?.jobs.length ?? 0;
    if (current.current.jobs.length >= target || !moreAvailable(current.current)) return current.current.jobs.length;
    busy.current = true; setLoadingMore(true); setMoreError('');
    const version = generation.current, controller = new AbortController(); request.current = controller;
    let lastAdded = 0;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const previous: SearchResult | null = current.current;
        if (!previous || previous.jobs.length >= target || !moreAvailable(previous)) break;
        const next = await searchRemoteJobs(filters.source, filters.query, filters.location, previous.nextPage ?? batch.current, controller.signal, false, filters.category, filters.experience, previous.nextCursor ?? undefined);
        if (controller.signal.aborted || version !== generation.current) return 0;
        const jobs: Map<string, Job> = new Map(previous.jobs.map(job => [canonicalJobUrl(job.sourceUrl), job]));
        for (const job of next.jobs) jobs.set(canonicalJobUrl(job.sourceUrl), job);
        lastAdded = jobs.size - previous.jobs.length;
        current.current = { ...next, jobs: [...jobs.values()] }; batch.current++;
        setResult(current.current); setAdded(lastAdded);
        if (!lastAdded || next.sourceResults.some(source => source.status === 'error')) break;
      }
    } catch (problem) {
      if (!controller.signal.aborted) setMoreError(problem instanceof Error ? problem.message : '추가 공고를 가져오지 못했어요.');
    } finally {
      if (!controller.signal.aborted && version === generation.current) { busy.current = false; setLoadingMore(false); }
    }
    return controller.signal.aborted ? 0 : current.current?.jobs.length ?? 0;
  }, [filters]);
  const hasMore = moreAvailable(result);
  const canAutoLoad = hasMore && !loading && !loadingMore && !moreError && added > 0 && !result?.sourceResults.some(source => source.status === 'error');
  return { result, readyForFilters: resolvedFilters.current === filters, loading, loadingMore, error, moreError, added, hasMore, canAutoLoad, loadThrough };
}
