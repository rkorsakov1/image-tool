import { useState, type FormEvent } from 'react';
import { cn } from '../../lib/cn';
import { useApp } from '../../state/AppContext';
import { fetchImageFromUrl, looksLikeUrl } from '../../state/ingest';
import { Button } from '../ui/Button';
import { Icon, Spinner } from '../ui/Icon';

/** Fetches a URL and adds the image. Shared by the URL field and the paste listener. */
export const useUrlLoader = () => {
  const { addFiles, notify } = useApp();
  const [loading, setLoading] = useState(false);

  const load = async (url: string): Promise<boolean> => {
    if (!looksLikeUrl(url)) {
      notify('error', 'Enter a full http:// or https:// image URL.');
      return false;
    }
    setLoading(true);
    try {
      const { blob, name } = await fetchImageFromUrl(url);
      await addFiles([{ blob, name }]);
      return true;
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { load, loading };
};

/** Link icon + URL field; the Fetch button appears once something is typed. */
export const UrlInput = ({ variant = 'hero' }: { variant?: 'hero' | 'header' }) => {
  const [value, setValue] = useState('');
  const { load, loading } = useUrlLoader();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await load(value)) setValue('');
  };

  const showFetch = variant === 'hero' || value.trim() !== '' || loading;

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Load image from URL"
      className={cn(
        'flex items-center gap-2 rounded-md border bg-raised pl-2.5',
        'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
        variant === 'header' ? 'h-8 w-60 border-line' : 'h-9 w-72 border-line-strong pr-1 max-lg:h-11 max-lg:w-full',
      )}
    >
      <Icon name="link" className="size-4 shrink-0 text-ink-3" />
      <input
        type="url"
        inputMode="url"
        enterKeyHint="go"
        placeholder={variant === 'header' ? 'Paste an image URL' : 'https:// image URL'}
        aria-label="Image URL"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-3 max-lg:text-base"
      />
      {showFetch ? (
        <Button type="submit" size="xs" variant="ghost" className="mr-0.5" disabled={loading || value.trim() === ''} aria-busy={loading}>
          {loading ? <Spinner /> : null} Fetch
        </Button>
      ) : null}
    </form>
  );
};
