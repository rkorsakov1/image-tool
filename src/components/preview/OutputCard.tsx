import { cn } from '../../lib/cn';
import { formatBytes, formatSavings, FORMAT_LABELS } from '../../lib/format';
import type { Preset, QueueItem } from '../../lib/types';
import { checkerboardClass } from './Checkerboard';

type OutputCardProps = { item: QueueItem; preset: Preset };

const Spinner = () => (
  <span
    aria-hidden="true"
    className="inline-block size-3.5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent motion-reduce:animate-none"
  />
);

/** The real encoded output: thumbnail, exact size, dimensions, quality and savings. */
export const OutputCard = ({ item, preset }: OutputCardProps) => {
  const { output } = item;
  const stale = item.outputRevision !== item.revision;
  const encoding = stale && item.status !== 'error';
  const qualityLabel = preset.format === 'png' ? 'lossless' : `q${output?.quality ?? preset.quality}`;

  return (
    <section aria-labelledby="output-heading" className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="output-heading" className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Output
        </h3>
        {encoding ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Spinner /> Encoding…
          </span>
        ) : null}
      </div>

      <div className="flex gap-3">
        <div className={cn('flex size-24 shrink-0 items-center justify-center overflow-hidden rounded', checkerboardClass)}>
          {output ? (
            <img
              src={output.url}
              alt={`Encoded output preview, ${output.width} by ${output.height}`}
              className={cn('max-h-full max-w-full object-contain', { 'opacity-60': stale })}
            />
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>

        {output ? (
          <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">Size</dt>
            <dd className="font-semibold tabular-nums">
              {formatBytes(output.blob.size)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({output.blob.size.toLocaleString()} B)</span>
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Pixels</dt>
            <dd className="tabular-nums">
              {output.width} × {output.height}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Format</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {FORMAT_LABELS[preset.format]} {qualityLabel}
              {output.encoder === 'native' ? (
                <span
                  title="The optimized encoder couldn't load, so the browser's built-in encoder was used."
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                >
                  native encoder
                </span>
              ) : null}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">vs source</dt>
            <dd className="tabular-nums">
              {formatSavings(item.sourceBytes, output.blob.size)}{' '}
              <span className="text-xs text-slate-500 dark:text-slate-400">of {formatBytes(item.sourceBytes)}</span>
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{item.status === 'error' ? 'Encoding failed.' : 'Preparing preview…'}</p>
        )}
      </div>

      {output?.warning && !stale ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{output.warning}</p> : null}
      {item.status === 'error' && item.error ? (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {item.error}
        </p>
      ) : null}
    </section>
  );
};
