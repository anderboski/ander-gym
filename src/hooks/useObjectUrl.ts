import { useEffect, useState } from 'react';

/**
 * An object URL for a Blob, revoked when the blob changes or the component
 * unmounts. Null until the effect has run (and always null for a null blob).
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
