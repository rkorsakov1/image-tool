import { useState, type FormEvent } from 'react';
import { useApp } from '../../state/AppContext';
import { fetchImageFromUrl, looksLikeUrl } from '../../state/ingest';
import { Button } from '../ui/Button';
import { inputClass } from '../ui/Field';

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

export const UrlInput = () => {
  const [value, setValue] = useState('');
  const { load, loading } = useUrlLoader();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await load(value)) setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2" aria-label="Load image from URL">
      <input
        type="url"
        inputMode="url"
        placeholder="https://… image URL"
        aria-label="Image URL"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={inputClass}
      />
      <Button type="submit" disabled={loading || value.trim() === ''} aria-busy={loading}>
        {loading ? 'Loading…' : 'Fetch'}
      </Button>
    </form>
  );
};
